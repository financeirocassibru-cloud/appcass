import { z } from 'zod'
import { isISODate } from '@/lib/finance/date'
import { formatCents } from '@/lib/finance/money'
import { formatISODateBR } from './proposal'

/**
 * A triagem: o primeiro tempo da conversa. v1.1 — 2026-09-27.
 *
 * v1.1 (Fase 13 no assistente): o rascunho sabe de onde veio o dinheiro (`paid_with`, em texto
 * livre — "cartão Nubank", "empréstimo") e reconhece "paguei a fatura" (`fatura`). Sem isso a
 * triagem lia "gastei 30 no Uber no cartão" como uma saída comum, a pessoa confirmava, e o
 * segundo tempo recebia um rascunho aprovado que já não falava do cartão.
 *
 * Módulo **puro** (invariante 9): sem I/O, sem Supabase, sem relógio implícito — a
 * data de referência entra por parâmetro.
 *
 * ## Por que existe
 *
 * Antes, escrever uma frase disparava de uma vez o caminho pesado: oito queries para
 * montar o retrato financeiro e uma interação em background com as 27 ferramentas. A
 * primeira coisa que a pessoa via era "Pode fechar o app", antes de nada ter
 * acontecido — e se a IA tivesse entendido errado, só se descobria no fim.
 *
 * A triagem inverte a ordem. Ela responde três perguntas, em uma chamada barata e sem
 * tocar no banco:
 *
 *  1. **isto é sobre dinheiro?** Se não é, a conversa acaba aqui, de graça. "Que horas
 *     são?" não precisa de retrato financeiro nem de ferramenta nenhuma para receber
 *     uma resposta honesta;
 *  2. **o que dá para preencher?** O rascunho — valor, data, descrição, palpite de
 *     categoria — que é o "formulário" da conversa;
 *  3. **como dizer isso em português?** O `reply`, que é a leitura do rascunho de
 *     volta, para a pessoa corrigir um mal-entendido em segundos em vez de descobrir
 *     no fim.
 *
 * ## O que a triagem NÃO é
 *
 * Ela não propõe operação, não conhece id nenhum e não escreve em lugar nenhum. O
 * rascunho é um palpite legível, não um comando: quem vira operação de verdade é o
 * segundo tempo, com o contexto financeiro na mão e as ferramentas. Por isso a
 * triagem pode ser barata, pode errar sem consequência e **não precisa sobreviver ao
 * app fechar** — ela é re-derivável por uma chamada de um segundo, e é justamente isso
 * que a dispensa de rodar em background.
 */

/** O que a triagem acha que a pessoa quis registrar. Palpite, não operação. */
export const draftIntents = [
  'entrada',
  'saida',
  'conta_fixa',
  'parcelamento',
  'meta',
  'aporte',
  // v1.1 — 2026-09-27: pagar a fatura do cartão ou a parcela de um empréstimo.
  'fatura',
  'ajuste_saldo',
  'excluir',
  'outro',
] as const

export type DraftIntent = (typeof draftIntents)[number]

/**
 * Centavos inteiros, ou nada.
 *
 * Mesmo rigor do `cents` de `proposal.ts`, e pelo mesmo motivo: `87.5` querendo dizer
 * R$ 87,50 tem de ser recusado, não arredondado (invariante 1). A diferença é que aqui
 * `null` é resposta legítima — "gastei no mercado" sem valor é exatamente o caso em que
 * a IA deve perguntar quanto, e não inventar.
 */
const draftCents = z
  .number()
  .int('O valor precisa vir em centavos inteiros')
  .positive('O valor precisa ser maior que zero')
  .max(9_999_999_999)
  .nullish()
  .transform((value) => value ?? null)

/** Data de competência pura, ou nada (invariante 2). */
const draftDate = z
  .string()
  .trim()
  .refine(isISODate, 'Data inválida')
  .nullish()
  .transform((value) => value ?? null)

const draftText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value === '' || value === undefined ? null : value))

export const draftItemSchema = z.object({
  intent: z.enum(draftIntents),
  amount_cents: draftCents,
  occurred_on: draftDate,
  description: draftText(120),
  /**
   * Palpite de categoria em **texto livre**, de propósito.
   *
   * A triagem não lê o banco, então não tem a lista de categorias para escolher um id.
   * Resolver o palpite contra as categorias reais é trabalho do segundo tempo, que tem
   * o contexto. Pedir um id aqui seria pedir para o modelo inventar um.
   */
  category_hint: draftText(40),
  installments: z.number().int().min(2).max(360).nullish().transform((v) => v ?? null),
  is_settled: z.boolean().nullish().transform((v) => v ?? null),
  /**
   * v1.1 — 2026-09-27: de onde veio o dinheiro, como a pessoa falou ("cartão Nubank",
   * "crédito", "empréstimo do banco"). Texto livre pelo mesmo motivo de `category_hint`: a
   * triagem não conhece os ids dos cartões. Nulo é "do saldo" ou "não disse".
   */
  paid_with: draftText(40),
  /** O que faltou, em português, para a IA saber o que perguntar. */
  missing: z
    .array(z.string().trim().min(1).max(60))
    .max(4)
    .nullish()
    .transform((value) => value ?? []),
})

export type DraftItem = z.infer<typeof draftItemSchema>

export const triageSchema = z.object({
  /** O portão. `false` encerra a conversa sem custo nenhum adiante. */
  pertinent: z.boolean(),
  /** A fala da IA: a leitura do rascunho de volta, em português corrido. */
  reply: draftText(600),
  items: z.array(draftItemSchema).max(10).nullish().transform((value) => value ?? []),
  /** O que perguntar quando faltou informação. */
  question: draftText(200),
})

export type Triage = z.infer<typeof triageSchema>

/** O formato fixo da resposta, para quando o provedor honrar o esquema. */
export const TRIAGE_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    pertinent: {
      type: 'boolean',
      description: 'true se a frase fala de dinheiro que entrou, saiu, vai entrar ou vai sair.',
    },
    reply: {
      type: 'string',
      description:
        'Uma ou duas frases em português do Brasil, falando COM a pessoa, repetindo o que você entendeu.',
    },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          intent: { type: 'string', enum: [...draftIntents] },
          amount_cents: { type: 'integer' },
          occurred_on: { type: 'string' },
          description: { type: 'string' },
          category_hint: { type: 'string' },
          installments: { type: 'integer' },
          is_settled: { type: 'boolean' },
          paid_with: { type: 'string' },
          missing: { type: 'array', items: { type: 'string' } },
        },
        required: ['intent'],
      },
    },
    question: { type: 'string', description: 'O que perguntar quando faltou informação.' },
  },
  required: ['pertinent', 'reply'],
} as const

/**
 * Lê a resposta da triagem.
 *
 * Tolera o envelope por `parseLooseJson` — cerca de markdown, frase de cortesia — e
 * nada do conteúdo: o `triageSchema` continua sendo o juiz. Uma triagem ilegível
 * devolve `null`, e quem chama trata como "não deu, siga pelo caminho normal". Ela
 * nunca pode ser um jeito novo de a tela travar.
 */
export function parseTriage(raw: unknown): Triage | null {
  const parsed = triageSchema.safeParse(raw)
  if (!parsed.success) return null

  // Não-pertinente com itens é contradição: o portão vale mais que o palpite.
  if (!parsed.data.pertinent) return { ...parsed.data, items: [], question: null }

  return parsed.data
}

/** O campo tem valor? Ausente e nulo contam como a mesma coisa: não dizer nada. */
function preenchido<T>(valor: T | null | undefined): valor is T {
  return valor !== null && valor !== undefined
}

/**
 * O texto de reserva, montado aqui, para quando o `reply` do modelo vier vazio.
 *
 * A tela nunca pode ficar muda depois de a pessoa escrever. Isto não é um segundo
 * caminho de interpretação — é a mesma informação do rascunho dita em português, do
 * mesmo jeito que `describeOperation` faz para a proposta.
 *
 * A data é formatada por fatiamento de string (`formatISODateBR`), nunca por `Date`:
 * `new Date('2026-03-05')` lê como UTC e volta um dia em fuso negativo (invariante 2).
 */
export function draftSummary(items: readonly DraftItem[]): string {
  if (items.length === 0) return 'Não consegui identificar o que registrar. Pode contar de outro jeito?'

  const partes = items.map((item) => {
    const pedacos: string[] = [rotuloDoIntent(item.intent)]

    // `preenchido` e não `!== null`: o schema normaliza ausente para `null`, mas esta
    // função também é chamada com objeto montado à mão, e um `undefined` escapando de um
    // `!== null` já produziu "em undefinedx" na tela. Campo vazio simplesmente não é dito.
    if (preenchido(item.amount_cents)) pedacos.push(`de ${formatCents(item.amount_cents)}`)
    if (preenchido(item.description)) pedacos.push(`em ${item.description}`)
    if (preenchido(item.occurred_on)) pedacos.push(`no dia ${formatISODateBR(item.occurred_on)}`)
    if (preenchido(item.installments)) pedacos.push(`em ${item.installments}x`)
    // v1.1 — 2026-09-27
    if (preenchido(item.paid_with)) pedacos.push(`no ${item.paid_with}`)

    return pedacos.join(' ')
  })

  return `Entendi ${partes.length === 1 ? 'assim' : `${partes.length} coisas`}: ${partes.join('; ')}.`
}

/**
 * O rascunho como texto para o prompt do segundo tempo.
 *
 * Diferente de `draftSummary`, que é para a pessoa ler: aqui o destinatário é o modelo,
 * então o que importa é ser inequívoco. Campo vazio aparece como "não informado" em vez
 * de sumir — sumir convidaria o modelo a preencher a lacuna por conta própria, que é
 * justamente o que a pessoa já disse que não sabia.
 */
export function draftPromptBlock(items: readonly DraftItem[]): string {
  return items
    .map((item, indice) => {
      const campos = [
        `tipo: ${item.intent}`,
        `valor em centavos: ${item.amount_cents ?? 'não informado'}`,
        `data: ${item.occurred_on ?? 'não informada'}`,
        `descrição: ${item.description ?? 'não informada'}`,
        `categoria sugerida: ${item.category_hint ?? 'nenhuma'}`,
      ]

      if (preenchido(item.installments)) campos.push(`parcelas: ${item.installments}`)
      // v1.1 — 2026-09-27: o cartão/empréstimo, para o segundo tempo achar o id no contexto.
      if (preenchido(item.paid_with)) campos.push(`pago com: ${item.paid_with}`)
      if (preenchido(item.is_settled)) {
        campos.push(`já aconteceu: ${item.is_settled ? 'sim' : 'não'}`)
      }

      return `${indice + 1}. ${campos.join('; ')}`
    })
    .join('\n')
}

/** O rótulo em português de cada palpite. Só texto de tela; não decide nada. */
const ROTULOS: Record<DraftIntent, string> = {
  entrada: 'uma entrada',
  saida: 'uma saída',
  conta_fixa: 'uma conta que se repete',
  parcelamento: 'uma compra parcelada',
  meta: 'uma meta',
  aporte: 'um valor guardado numa meta',
  fatura: 'o pagamento de uma fatura',
  ajuste_saldo: 'um ajuste de saldo',
  excluir: 'apagar um registro',
  outro: 'algo sobre dinheiro',
}

function rotuloDoIntent(intent: DraftIntent): string {
  return ROTULOS[intent]
}

/**
 * As regras da triagem.
 *
 * Curta de propósito: é o que a mantém em uma viagem HTTP de um ou dois segundos. Ela
 * não recebe o retrato financeiro nem as ferramentas, e não precisa — não é ela quem
 * propõe a operação.
 */
export const TRIAGE_SYSTEM_INSTRUCTION = `Você é a primeira etapa de um assistente financeiro pessoal brasileiro. A pessoa conta, em português corrido, o que aconteceu com o dinheiro dela. Seu trabalho NÃO é registrar nada: é entender e confirmar.

PRIMEIRO, DECIDA SE É ASSUNTO DESTE APP:
- pertinent = true quando a frase fala de dinheiro que entrou, saiu, vai entrar, vai sair, foi guardado, ou de um registro a mudar ou apagar.
- pertinent = false para qualquer outra coisa: cumprimento, pergunta sobre o tempo, sobre você, sobre como o app funciona, ou conversa solta. Nesse caso escreva em "reply" uma resposta curta, gentil e honesta, dizendo que você cuida do dinheiro dela e dando um exemplo do que escrever. Deixe "items" vazio.

SE FOR ASSUNTO DO APP, PREENCHA O RASCUNHO:
- Um item por coisa dita. "Recebi 2 mil ontem e gastei 200 no mercado hoje" são DOIS itens.
- amount_cents SEMPRE em centavos inteiros. "R$ 87,50" é 8750. "2.400" é 240000. "dois mil" é 200000. "200 reais" é 20000. Nunca use decimal.
- occurred_on SEMPRE em YYYY-MM-DD. Use a data de hoje que vem no início da mensagem como referência para "hoje", "ontem", "anteontem", "semana passada". Nunca calcule a data de hoje por conta própria.
- intent: entrada (recebeu), saida (gastou), conta_fixa (se repete todo mês/semana/ano), parcelamento (dividido em 2 ou mais vezes), meta (objetivo de poupança), aporte (guardou para um objetivo), fatura (pagou a fatura do cartão ou a parcela de um empréstimo), ajuste_saldo (informar quanto tem), excluir (apagar um registro), outro.
- is_settled: true se já aconteceu, false se é a pagar ou a receber.
- paid_with: se a pessoa disse que foi no cartão, no crédito ou com empréstimo, escreva como ela falou ("cartão Nubank", "crédito", "empréstimo"). Débito, Pix e dinheiro: deixe nulo. Na intent fatura, o cartão da fatura. "Peguei um empréstimo de 5 mil" é intent entrada com paid_with "empréstimo".
- Compra parcelada no cartão ("3x no cartão") é intent parcelamento com paid_with preenchido.
- category_hint: o nome da categoria em texto livre, como a pessoa falaria ("Mercado", "Aluguel"). Não invente código nem identificador.
- O que você NÃO souber, deixe nulo e escreva em "missing" o nome do que faltou. Nunca chute valor nem data.

DEPOIS, ESCREVA A CONFIRMAÇÃO EM "reply":
- Uma ou duas frases, falando COM a pessoa: "Entendi: você recebeu R$ 2.000,00 ontem e gastou R$ 200,00 no mercado hoje."
- Use o valor em reais, com vírgula, e a data como dia/mês. Nunca mostre centavos crus nem YYYY-MM-DD.
- Termine perguntando se está certo, de forma curta.
- Se faltou algo, use "question" para pedir exatamente o que falta, uma coisa por vez.
- Nada de jargão, nada de explicar como o app funciona, nada de prometer que já registrou — você não registrou nada.

FORMATO DA RESPOSTA:
Responda com UM objeto JSON e nada mais, nesta forma:
{"pertinent": true, "reply": "...", "items": [{"intent": "saida", "amount_cents": 20000, "occurred_on": "2026-09-26", "description": "Mercado", "category_hint": "Mercado", "is_settled": true, "missing": []}], "question": null}
Sem cerca de markdown, sem texto antes nem depois do objeto.`
