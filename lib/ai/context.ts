import 'server-only'

import { getBalanceAnchor, getCurrentBalance } from '@/lib/db/queries/balance'
import { listActiveCategories } from '@/lib/db/queries/categories'
import { listRecentEntries } from '@/lib/db/queries/entries'
import { listGoals } from '@/lib/db/queries/goals'
import { listInstallmentPlans } from '@/lib/db/queries/installments'
import { listRecurringRules } from '@/lib/db/queries/recurring'
import { listScenarios } from '@/lib/db/queries/scenarios'
import { todayISO, type ISODate } from '@/lib/finance/date'
import { formatCents } from '@/lib/finance/money'
import type { LabelIndex } from './proposal'

/**
 * O retrato que a IA recebe junto da frase. v1.0 — 2026-09-26.
 *
 * Sem isto a IA só sabe criar coisa nova: para alterar ou apagar, ela precisa
 * dos ids do que já existe — e o invariante que impomos a ela é "todo id vem do
 * contexto, nunca da imaginação".
 *
 * O retrato é **recortado**, não completo. Mandar o extrato inteiro custaria
 * caro, encheria a janela e não melhoraria a resposta: quem diz "paguei o
 * mercado" está falando de algo recente. Os limites abaixo são o recorte.
 *
 * Nenhuma query nova foi inventada aqui — são as mesmas leituras que as telas
 * já usam, e todas passam pela RLS com o cliente normal.
 */

const RECENT_ENTRIES = 40

export interface AiContext {
  today: ISODate
  /** O texto que vai no prompt. */
  text: string
  /** Índice de nomes para a tela de confirmação falar de "Aluguel", não de UUID. */
  labels: LabelIndex
  /** Ids de categoria válidos, para recusar o que o modelo inventar. */
  validCategoryIds: ReadonlySet<string>
}

/** Uma linha do retrato: id curto primeiro, para o modelo copiá-lo sem erro. */
function line(id: string, ...parts: (string | number | null | undefined)[]): string {
  return `- [${id}] ${parts.filter((p) => p !== null && p !== undefined && p !== '').join(' · ')}`
}

/**
 * Monta o retrato financeiro da pessoa.
 *
 * As seis leituras vão em paralelo: são independentes, e em série somariam meio
 * segundo à espera de quem já está olhando para o cursor piscando.
 */
export async function buildContext(today: ISODate = todayISO()): Promise<AiContext> {
  const [balance, anchor, categories, entries, rules, plans, goals, scenarios] = await Promise.all([
    getCurrentBalance(today),
    getBalanceAnchor(),
    listActiveCategories(),
    listRecentEntries(RECENT_ENTRIES),
    listRecurringRules(),
    listInstallmentPlans(),
    listGoals(),
    listScenarios(),
  ])

  const labels: LabelIndex = {
    categories: Object.fromEntries(categories.map((c) => [c.id, c.name])),
    entries: Object.fromEntries(entries.map((e) => [e.id, e.description])),
    recurring: Object.fromEntries(rules.map((r) => [r.id, r.description])),
    installments: Object.fromEntries(plans.map((p) => [p.planId, p.description])),
    goals: Object.fromEntries(goals.map((g) => [g.id, g.name])),
    scenarios: Object.fromEntries(scenarios.map((s) => [s.id, s.name])),
  }

  const blocos: string[] = [
    `HOJE: ${today} (fuso America/Sao_Paulo — use exatamente esta data quando a pessoa disser "hoje")`,
    `SALDO ATUAL: ${formatCents(balance.currentCents)}` +
      (anchor.isConfigured
        ? ` (a partir da âncora de ${formatCents(anchor.openingBalanceCents)} em ${anchor.openingBalanceOn})`
        : ' (a pessoa ainda não informou quanto tem — a âncora do saldo não foi configurada)'),
  ]

  blocos.push(
    'CATEGORIAS (use category_id daqui; se nenhuma servir, crie com create_category):',
    ...categories.map((c) => line(c.id, c.name, c.kind === 'expense' ? 'despesa' : 'receita')),
  )

  if (entries.length > 0) {
    blocos.push(
      `LANÇAMENTOS RECENTES (os ${entries.length} últimos):`,
      ...entries.map((e) =>
        line(
          e.id,
          e.description,
          formatCents(e.amountCents),
          e.occurredOn,
          e.kind === 'expense' ? 'saída' : 'entrada',
          e.isSettled ? 'pago' : 'pendente',
          e.category?.name,
          // Parcela e conta fixa não se editam como lançamento solto: quem muda
          // o valor de uma parcela mexe no plano, não na linha gerada.
          e.source !== 'manual' ? `gerado por ${e.source}` : null,
        ),
      ),
    )
  }

  if (rules.length > 0) {
    blocos.push(
      'CONTAS FIXAS E RECEITAS RECORRENTES:',
      ...rules.map((r) =>
        line(
          r.id,
          r.description,
          formatCents(r.amountCents),
          r.frequency === 'monthly' && r.dayOfMonth ? `todo dia ${r.dayOfMonth}` : r.frequency,
          r.kind === 'expense' ? 'saída' : 'entrada',
          r.isActive ? null : 'PAUSADA',
        ),
      ),
    )
  }

  if (plans.length > 0) {
    blocos.push(
      'PARCELAMENTOS:',
      ...plans.map((p) =>
        line(
          p.planId,
          p.description,
          `${formatCents(p.totalAmountCents)} em ${p.installmentsCount}x`,
          `${p.paidCount} pagas`,
          p.nextDueOn ? `próxima em ${p.nextDueOn}` : 'quitado',
        ),
      ),
    )
  }

  if (goals.length > 0) {
    blocos.push(
      'METAS:',
      ...goals.map((g) =>
        line(
          g.id,
          g.name,
          `${formatCents(g.savedCents)} de ${formatCents(g.targetAmountCents)}`,
          g.targetDate ? `até ${g.targetDate}` : null,
        ),
      ),
    )
  }

  if (scenarios.length > 0) {
    blocos.push(
      'CENÁRIOS DE PROJEÇÃO:',
      ...scenarios.map((s) =>
        line(s.id, s.name, `${s.startsOn} a ${s.endsOn}`, s.isActive ? 'ATIVO' : null),
      ),
    )
  }

  return {
    today,
    text: blocos.join('\n'),
    labels,
    validCategoryIds: new Set(categories.map((c) => c.id)),
  }
}

/**
 * As regras que o modelo segue. Vão em `system_instruction`, separadas do que a
 * pessoa escreveu — o texto dela é dado, não instrução.
 */
export const SYSTEM_INSTRUCTION = `Você é o assistente financeiro de um app pessoal brasileiro. A pessoa conta em português, em linguagem corrida, o que aconteceu com o dinheiro dela. Seu trabalho é traduzir isso em chamadas de ferramenta.

REGRAS QUE NÃO SE QUEBRAM:
- Valores SEMPRE em centavos inteiros. "R$ 87,50" é 8750. "2.400" é 240000. "mil reais" é 100000. Nunca use decimal.
- Datas SEMPRE em YYYY-MM-DD. Use a data de HOJE que está no contexto como referência para "hoje", "ontem", "semana passada". Nunca calcule a data de hoje por conta própria.
- Todo id (de lançamento, conta fixa, meta, categoria, parcelamento, cenário) TEM de vir do contexto, copiado exatamente. Nunca invente um id.
- Se a pessoa se referir a algo que não está no contexto, ou se a frase for ambígua a ponto de você ter de adivinhar valor, data ou alvo, NÃO chame ferramenta nenhuma: responda em texto, em português, dizendo o que ficou faltando.

COMO ESCOLHER A FERRAMENTA:
- Algo que aconteceu uma vez, com data única: create_entry.
- Algo que se repete todo mês/semana/ano ("aluguel todo dia 10", "salário dia 5"): create_recurring.
- Compra dividida em 2 ou mais vezes: create_installment_plan, com o valor TOTAL. "3x de 100" é total 30000. Para "1x", use create_entry.
- Dinheiro guardado para um objetivo: create_contribution numa meta existente.
- "Paguei a conta de luz deste mês", quando existe uma conta fixa correspondente: materialize_recurring, não create_entry — assim o app não duplica o lançamento.

OUTRAS CONVENÇÕES:
- Se a pessoa já gastou ou já recebeu, is_settled = true. Se é conta a pagar ou a receber, false.
- Escolha a categoria mais próxima entre as do contexto. Só crie categoria nova se nenhuma servir mesmo; nesse caso chame create_category primeiro e, nas operações seguintes, informe category_name com o mesmo nome.
- Várias coisas numa frase só viram várias chamadas de ferramenta, na ordem em que foram ditas.
- Descrições curtas e em português, como a pessoa falaria: "Mercado", "Aluguel", "Uber".
- Nada do que você propuser é executado antes de a pessoa confirmar na tela. Proponha o que entendeu; não peça permissão em texto.`
