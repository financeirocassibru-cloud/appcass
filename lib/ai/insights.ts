import 'server-only'

import { getAgendaItems } from '@/lib/db/queries/agenda'
import { getBalanceAnchor, getCurrentBalance } from '@/lib/db/queries/balance'
import { listEntriesInRange, type EntryWithCategory } from '@/lib/db/queries/entries'
import { listGoals } from '@/lib/db/queries/goals'
import { getProjection } from '@/lib/db/queries/projection'
import { getCategoryBreakdown, getMonthlySeries } from '@/lib/db/queries/summary'
import { DEFAULT_HORIZON_DAYS, splitAgenda } from '@/lib/finance/agenda'
import { addDays, todayISO, type ISODate } from '@/lib/finance/date'
import { formatCents } from '@/lib/finance/money'
import { geminiModelChain } from './env'
import { cancelInteraction, getInteraction, isTerminal, startInteraction } from './gemini'
import { nextModel } from './models'
import { formatISODateBR } from './proposal'

/**
 * Resumo da situação financeira e dicas. v1.2 — 2026-09-26.
 *
 * **Só sob demanda.** Nada aqui roda ao abrir uma tela: o resumo nasce quando a
 * pessoa toca em "Ver resumo". Foi uma decisão explícita — um resumo gerado a
 * cada carregamento custaria uma chamada por visita para dizer quase sempre a
 * mesma coisa, e ainda atrasaria a tela.
 *
 * ## v1.2 — texto livre, histórico de verdade, e nada gravado
 *
 * O resumo **não é mais um trabalho no banco**. Ele não era um registro: era uma
 * leitura, e guardá-lo em `ai_jobs` acumulava linhas que ninguém ia reler, num
 * histórico que passou a mostrar cópias de análises velhas ao lado dos lançamentos que
 * a pessoa de fato pediu. Agora ele roda dentro do próprio pedido, por `runInsights`,
 * e volta como texto na resposta da action. Quem quiser guardar, copia.
 *
 * O custo é honesto e está numa frase: **enquanto o resumo é gerado, a pessoa precisa
 * ficar na tela.** Não há linha para a varredura retomar nem push para avisar. Foi a
 * troca aceita — o resumo é barato de refazer, e refazê-lo custa menos que manter um
 * histórico de coisas que ninguém consulta.
 *
 * ## Texto livre, e o histórico de verdade
 *
 * Duas mudanças que vêm do mesmo fracasso. A v1.1 pedia a resposta num formato fixo
 * (`{summary, tips}`), validava com Zod e recusava o que não batesse. Pareceu
 * prudente e falhou em produção três vezes seguidas, todas com "O resumo voltou em
 * formato inesperado" — porque um modelo devolve o conteúdo certo em mil formas
 * ligeiramente diferentes, e prever cada uma é uma corrida que não se ganha.
 *
 * Então o formato saiu. **Agora é texto corrido**, e a validação é só "veio texto?".
 * Some com isso toda uma classe de falha, e de lado some também a dependência do
 * `response_format`, o único campo cujo contrato eu não conseguia verificar na API
 * beta. Menos promessa, menos coisa para quebrar.
 *
 * A segunda mudança é o que o modelo vê. Antes ele recebia **só agregados** — saldo,
 * totais do mês, ranking de categorias — e nenhum lançamento; o prompt saía com 492
 * caracteres, e com tão pouco na mão ele tinha pouco a dizer e improvisava o resto.
 * Agora ele lê o histórico real do período que a pessoa escolher, lançamento por
 * lançamento, além dos agregados. Ele interpreta; a conta continua sendo do app.
 */

const PROJECTION_DAYS = 90
const TOP_CATEGORIES = 5

/** Quantos lançamentos, no máximo, vão no prompt. Teto de segurança, não regra. */
const MAX_ENTRIES = 300

/**
 * O período do histórico, em dias.
 *
 * O teto de 60 é do pedido, e o piso de 1 é aritmética: um resumo de zero dias não
 * veria lançamento nenhum e diria que não há nada acontecendo — o que seria mentira
 * por construção.
 */
export const PERIOD_DAYS = { min: 1, max: 60, default: 30 } as const

/**
 * Lê o período que veio da tela.
 *
 * Recorta em vez de recusar: quem digitou 90 quis "bastante", e devolver erro para
 * um campo numérico seria trocar uma resposta por um formulário. Já texto solto,
 * vírgula e vazio caem no padrão — não há o que adivinhar ali.
 *
 * Puro de propósito, para o teste não precisar de formulário nem de banco.
 */
export function parsePeriodDays(raw: unknown): number {
  // Campo vazio é ausência, não zero. `Number('')` é `0`, e sem este corte um campo
  // limpo cairia no piso de 1 dia em vez do padrão — um resumo de ontem só, em
  // silêncio, sem ninguém ter pedido isso.
  if (typeof raw === 'string' && raw.trim() === '') return PERIOD_DAYS.default

  const numero =
    typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.trim()) : Number.NaN

  if (!Number.isFinite(numero) || !Number.isInteger(numero)) return PERIOD_DAYS.default
  if (numero < PERIOD_DAYS.min) return PERIOD_DAYS.min
  if (numero > PERIOD_DAYS.max) return PERIOD_DAYS.max

  return numero
}

/** Teto do texto do resumo. Generoso: é para conter desgoverno, não para editar. */
const MAX_TEXT = 8_000

/**
 * Lê a resposta do modelo.
 *
 * É a validação inteira, e é curta porque tem de ser: texto é texto. Vazio devolve
 * `null` e quem chama trata como falha — com uma mensagem que diz exatamente isso,
 * e não um "formato inesperado" que antes cobria dois casos diferentes (não veio
 * JSON / veio JSON que o schema recusou) e escondia qual era.
 */
export function readInsightsText(outputText: string | undefined): string | null {
  const limpo = outputText?.trim()
  if (!limpo) return null

  return limpo.length > MAX_TEXT ? `${limpo.slice(0, MAX_TEXT).trimEnd()}…` : limpo
}

/**
 * Uma linha de lançamento como o modelo a lê.
 *
 * **Puro**, e separado de `buildInsightsInput` por isso: a montagem do prompt faz
 * I/O e não cabe em teste unitário, mas a formatação do dinheiro e da data cabe — e
 * é ali que mora o risco dos invariantes 1 e 2.
 *
 * A data sai por `formatISODateBR`, que fatia a string. `new Date('2026-03-05')` lê
 * como UTC e volta um dia em fuso negativo, e é isso que o `test:tz` vigia.
 */
export function formatEntryLine(entry: EntryWithCategory): string {
  const pedacos = [
    formatISODateBR(entry.occurredOn),
    entry.kind === 'expense' ? 'saída' : 'entrada',
    formatCents(entry.amountCents),
    entry.description,
    entry.category?.name ?? 'sem categoria',
    entry.isSettled ? 'pago' : 'pendente',
  ]

  if (entry.source !== 'manual') pedacos.push(`gerado por ${entry.source}`)

  return `  ${pedacos.join(' · ')}`
}

/**
 * O retrato que vai no prompt: os agregados mais o histórico do período.
 *
 * Em português e já formatado: o modelo lê melhor "R$ 2.400,00 em Mercado" do que um
 * JSON de centavos, e o risco de ele reapresentar um número cru errado na resposta
 * cai.
 *
 * `days` entra por parâmetro, e `today` também — sem relógio implícito, no espírito
 * do invariante 9, ainda que esta função faça I/O.
 */
export async function buildInsightsInput(
  days: number = PERIOD_DAYS.default,
  today: ISODate = todayISO(),
): Promise<string> {
  const periodo = parsePeriodDays(days)
  const desde = addDays(today, -periodo)

  const [balance, anchor, breakdown, monthly, agendaItems, goals, projection, entries] =
    await Promise.all([
      getCurrentBalance(today),
      getBalanceAnchor(),
      getCategoryBreakdown(today),
      getMonthlySeries(today, 6),
      getAgendaItems(today, DEFAULT_HORIZON_DAYS),
      listGoals(),
      getProjection(PROJECTION_DAYS, today),
      listEntriesInRange(desde, today, MAX_ENTRIES),
    ])

  const agenda = splitAgenda(agendaItems, today, DEFAULT_HORIZON_DAYS)
  const linhas: string[] = [`Data de hoje: ${today}.`]

  linhas.push(
    anchor.isConfigured
      ? `Saldo atual: ${formatCents(balance.currentCents)}.`
      : `Saldo atual: ${formatCents(balance.currentCents)} — ATENÇÃO: a pessoa nunca informou quanto tem de verdade, então este número parte de zero e provavelmente está errado. Sugira que ela ajuste o saldo em Ajustes.`,
  )
  linhas.push(
    `Neste mês, já liquidado: ${formatCents(balance.settledIncomeCents)} de entradas e ${formatCents(balance.settledExpenseCents)} de saídas.`,
  )

  // O histórico vem primeiro entre os blocos grandes: é o que tem mais substância, e
  // é dele que sai uma observação específica em vez de um comentário genérico.
  if (entries.length > 0) {
    linhas.push(
      `LANÇAMENTOS DOS ÚLTIMOS ${periodo} DIAS (de ${formatISODateBR(desde)} a ${formatISODateBR(today)}, ${entries.length} no total, do mais recente para o mais antigo):`,
      ...entries.map(formatEntryLine),
    )

    if (entries.length === MAX_ENTRIES) {
      linhas.push(
        `  (a lista foi cortada em ${MAX_ENTRIES}; há mais lançamentos no período do que os mostrados)`,
      )
    }
  } else {
    linhas.push(
      `Nenhum lançamento nos últimos ${periodo} dias. Diga isso à pessoa e sugira registrar o que aconteceu, para o próximo resumo valer mais.`,
    )
  }

  if (monthly.length > 0) {
    linhas.push(
      'Últimos meses (entradas / saídas):',
      ...monthly.map(
        (m) => `  ${m.month}: ${formatCents(m.incomeCents)} / ${formatCents(m.expenseCents)}`,
      ),
    )
  }

  if (breakdown.slices.length > 0) {
    linhas.push(
      `Para onde foi o dinheiro em ${breakdown.month} (total ${formatCents(breakdown.totalCents)}):`,
      ...breakdown.slices
        .slice(0, TOP_CATEGORIES)
        .map((s) => `  ${s.name}: ${formatCents(s.totalCents)}`),
    )
  }

  if (agenda.overdue.length > 0) {
    linhas.push(
      `EM ATRASO (${agenda.overdue.length}):`,
      ...agenda.overdue
        .slice(0, 10)
        .map((i) => `  ${i.description}: ${formatCents(i.amountCents)} venceu em ${i.occurredOn}`),
    )
  }

  if (agenda.upcoming.length > 0) {
    linhas.push(
      `A vencer nos próximos ${DEFAULT_HORIZON_DAYS} dias (${agenda.upcoming.length}):`,
      ...agenda.upcoming
        .slice(0, 10)
        .map((i) => `  ${i.description}: ${formatCents(i.amountCents)} em ${i.occurredOn}`),
    )
  }

  if (goals.length > 0) {
    linhas.push(
      'Metas:',
      ...goals.map(
        (g) =>
          `  ${g.name}: ${formatCents(g.savedCents)} de ${formatCents(g.targetAmountCents)} (${g.pct}%)${g.targetDate ? `, até ${g.targetDate}` : ''}`,
      ),
    )
  }

  linhas.push(
    projection.firstNegativeDay
      ? `PROJEÇÃO: mantido o ritmo atual, o saldo fica NEGATIVO a partir de ${projection.firstNegativeDay}.`
      : `PROJEÇÃO: o saldo não fica negativo nos próximos ${PROJECTION_DAYS} dias.`,
  )

  if (projection.overdueCents > 0) {
    linhas.push(`Contas vencidas e não pagas somam ${formatCents(projection.overdueCents)}.`)
  }

  return linhas.join('\n')
}

/**
 * Quanto tempo, no total, esperar pelo resumo dentro do pedido.
 *
 * Abaixo do `maxDuration` de 60s da rota, com folga para a resposta sair. Dividido em
 * duas fatias de 20s, o que deixa uma queda de modelo caber no orçamento — a mesma
 * lógica de `DEADLINE_MS.insights`, só que gasta aqui e não numa linha do banco.
 */
const BUDGET_MS = 40_000
const SLICE_MS = 20_000
const POLL_MS = 1_500

/**
 * Gera o resumo **dentro do pedido** e devolve o texto.
 *
 * Não cria linha em `ai_jobs`, não manda push, não deixa rastro: o resumo é leitura, e
 * o que a pessoa quiser guardar ela copia. Por isso ele também não precisa sobreviver ao
 * app fechar — é re-derivável por um toque.
 *
 * A interação é criada em `background` mesmo assim, e isso não é contradição: sem
 * background, uma geração de trinta segundos ficaria pendurada numa única resposta HTTP
 * e o `HTTP_TIMEOUT_MS` de 15s a abortaria no meio. Com background, cada chamada é
 * curta e quem espera é este laço, dentro do orçamento da rota.
 *
 * Devolve `null` quando nenhum modelo entregou a tempo. Quem chama transforma isso numa
 * frase em português; aqui não se inventa meio resumo.
 */
export async function runInsights(
  days: number = PERIOD_DAYS.default,
  today: ISODate = todayISO(),
): Promise<string | null> {
  const prompt = await buildInsightsInput(days, today)
  const chain = geminiModelChain()
  const ateQuando = Date.now() + BUDGET_MS

  let model = chain[0]

  while (model && Date.now() < ateQuando) {
    const texto = await tentarModelo(model, prompt, Math.min(SLICE_MS, ateQuando - Date.now()))
    if (texto) return texto

    model = nextModel(chain, model) ?? undefined
  }

  return null
}

/** Uma tentativa, num modelo, dentro da fatia de tempo dele. */
async function tentarModelo(
  model: string,
  prompt: string,
  sliceMs: number,
): Promise<string | null> {
  let interactionId: string | undefined

  try {
    const criada = await startInteraction({
      model,
      input: prompt,
      systemInstruction: INSIGHTS_SYSTEM_INSTRUCTION,
      // Sem `responseSchema`: o resumo é texto corrido. Pedir formato fixo foi o que o
      // fez falhar três vezes, e pedi-lo sem precisar é mais uma chance de o provedor
      // recusar o corpo inteiro.
    })

    interactionId = criada.id
    const pronta = readInsightsText(criada.output_text)
    if (pronta) return pronta

    const ateQuando = Date.now() + sliceMs

    while (Date.now() < ateQuando) {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS))

      const atual = await getInteraction(criada.id)
      const texto = readInsightsText(atual.output_text)
      if (texto) return texto

      // Terminou sem texto: insistir neste modelo não muda nada.
      if (isTerminal(atual.status)) break
    }

    // A fatia acabou, ou terminou seca. Cancelar para a interação não seguir pendurada
    // gastando cota por uma resposta que já não tem para onde ir.
    await cancelInteraction(criada.id)

    return null
  } catch {
    // Falha de provedor não é erro para a pessoa ler modelo por modelo: quem chama
    // decide o que dizer quando a cadeia inteira acabar.
    if (interactionId) await cancelInteraction(interactionId)

    return null
  }
}

export const INSIGHTS_SYSTEM_INSTRUCTION = `Você analisa a situação financeira de uma pessoa a partir do histórico e do retrato que o app dela calculou. Responda em português do Brasil.

FORMATO: texto corrido, e nada além disso.
- Dois a cinco parágrafos curtos, separados por uma linha em branco.
- Sem JSON, sem cerca de markdown, sem título, sem lista com marcadores, sem negrito. Só prosa, como alguém explicando por mensagem.
- Não comece com saudação nem com "aqui está seu resumo". Comece pelo assunto.

O QUE DIZER:
- Abra pelo que mais importa: contas em atraso, saldo que vai ficar negativo, ou um gasto muito acima do padrão dos meses anteriores. Se nada disso existe, diga que está sob controle e explique por quê.
- Use o histórico para ser específico. Você tem os lançamentos do período: cite o que chama atenção pelo nome e pelo valor ("os R$ 340,00 no mercado em três idas na mesma semana"), aponte repetição, concentração numa categoria, ou uma despesa fora do padrão.
- Fale com a pessoa ("você gastou"), não sobre ela.
- As sugestões entram no meio do texto, na mesma prosa, ligadas ao que você acabou de observar. Não as separe numa lista nem as anuncie como "dicas".
- Seja específico e use os números do retrato. "Reduza gastos" não ajuda; "as duas contas em atraso somam R$ 340,00 e resolvê-las antes do dia 10 evita que o saldo fique negativo" ajuda.

O QUE NÃO FAZER:
- Não invente número, data ou categoria que não esteja no retrato ou no histórico.
- Não recalcule nada: os valores já vêm somados, copie-os como estão.
- Nada de conselho de investimento, de produto financeiro ou de crédito.
- Sem moralizar e sem elogio vazio. A pessoa quer saber onde está, não ser parabenizada.
- Não repita a lista de lançamentos de volta. Ela já a tem; o que falta é o que você enxerga nela.
- Se o período tiver pouca informação, diga isso em uma frase e sugira o que registrar para o próximo resumo valer mais.`
