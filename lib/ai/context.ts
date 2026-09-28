import 'server-only'

import { getBalanceAnchor, getCurrentBalance } from '@/lib/db/queries/balance'
import { listActiveCategories } from '@/lib/db/queries/categories'
import { getCreditLedger } from '@/lib/db/queries/credit'
import { listRecentEntries } from '@/lib/db/queries/entries'
import { listGoals } from '@/lib/db/queries/goals'
import { listInstallmentPlans } from '@/lib/db/queries/installments'
import { listRecurringRules } from '@/lib/db/queries/recurring'
import { listScenarios } from '@/lib/db/queries/scenarios'
import { availableLimitCents, billStatusLabel, isBillDue } from '@/lib/finance/credit'
import { todayISO, type ISODate } from '@/lib/finance/date'
import { formatCents } from '@/lib/finance/money'
import type { CreditLabel, LabelIndex } from './proposal'

/**
 * O retrato que a IA recebe junto da frase. v1.1 — 2026-09-27.
 *
 * v1.1 (Fase 13 no assistente): cartões e empréstimos, com o ciclo e o limite, e as faturas
 * que ainda cobram alguma coisa — é daqui que saem o `credit_account_id` do "Pago com" e o
 * par conta + vencimento de `pay_credit_bill`. Cada lançamento recente diz de onde veio o
 * dinheiro, e o pagamento de fatura aparece como tal, para "apague a compra do Uber" não virar
 * "apague o pagamento da fatura". As regras novas estão em `SYSTEM_INSTRUCTION`.
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
/** v1.1 — 2026-09-27: quantas faturas a pagar por conta vão no retrato. */
const BILLS_PER_ACCOUNT = 3

export interface AiContext {
  today: ISODate
  /** O texto que vai no prompt. */
  text: string
  /** Índice de nomes para a tela de confirmação falar de "Aluguel", não de UUID. */
  labels: LabelIndex
  /** Ids de categoria válidos, para recusar o que o modelo inventar. */
  validCategoryIds: ReadonlySet<string>
  /** v1.1 — 2026-09-27: ids de cartão/empréstimo da pessoa, para o ajuste na confirmação. */
  validCreditAccountIds: ReadonlySet<string>
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
  const [balance, anchor, categories, entries, rules, plans, goals, scenarios, ledger] = await Promise.all([
    getCurrentBalance(today),
    getBalanceAnchor(),
    listActiveCategories(),
    listRecentEntries(RECENT_ENTRIES),
    listRecurringRules(),
    listInstallmentPlans(),
    listGoals(),
    listScenarios(),
    getCreditLedger(today),
  ])

  // v1.1 — 2026-09-27: todas as contas, inclusive arquivadas — um lançamento antigo pode ser de
  // uma delas, e a confirmação precisa do nome.
  const credit: Record<string, CreditLabel> = Object.fromEntries(
    ledger.accounts.map((a) => [
      a.id,
      { name: a.name, kind: a.kind, closingDay: a.closingDay, dueDay: a.dueDay, dueOn: a.dueOn },
    ]),
  )
  const creditName = (id: string | null): string | null => {
    const account = id ? credit[id] : undefined
    if (!account) return null
    return account.kind === 'card' ? `cartão ${account.name}` : `empréstimo ${account.name}`
  }

  const labels: LabelIndex = {
    categories: Object.fromEntries(categories.map((c) => [c.id, c.name])),
    entries: Object.fromEntries(entries.map((e) => [e.id, e.description])),
    recurring: Object.fromEntries(rules.map((r) => [r.id, r.description])),
    installments: Object.fromEntries(plans.map((p) => [p.planId, p.description])),
    goals: Object.fromEntries(goals.map((g) => [g.id, g.name])),
    scenarios: Object.fromEntries(scenarios.map((s) => [s.id, s.name])),
    credit,
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

  // v1.1 — 2026-09-27: só as ativas — arquivada não recebe compra nova.
  const activeAccounts = ledger.accounts.filter((a) => a.archivedAt === null)
  if (activeAccounts.length > 0) {
    blocos.push(
      'CARTÕES E EMPRÉSTIMOS (credit_account_id daqui quando a pessoa pagou "no cartão", "no crédito", "com o empréstimo"):',
      ...activeAccounts.map((a) => {
        const available = availableLimitCents(
          a,
          ledger.bills.filter((b) => b.accountId === a.id),
        )
        return line(
          a.id,
          a.name,
          a.kind === 'card' ? 'cartão' : 'empréstimo',
          a.kind === 'card'
            ? `fecha dia ${a.closingDay}, vence dia ${a.dueDay}`
            : a.dueOn
              ? `vencimento único em ${a.dueOn}`
              : a.dueDay
                ? `parcelas todo dia ${a.dueDay}`
                : 'vencimento escolhido a cada uso',
          available === null ? null : `disponível ${formatCents(available)}`,
        )
      }),
    )

    // As faturas que ainda cobram alguma coisa, as mais próximas de cada conta.
    const due = ledger.bills.filter((b) => isBillDue(b) && b.remainingCents > 0)
    const shown = activeAccounts.flatMap((a) =>
      due.filter((b) => b.accountId === a.id).slice(0, BILLS_PER_ACCOUNT),
    )
    if (shown.length > 0) {
      blocos.push(
        'FATURAS A PAGAR (para pay_credit_bill: account_id e due_on exatamente daqui):',
        ...shown.map((b) =>
          line(
            b.accountId,
            b.accountKind === 'card' ? `fatura ${b.accountName}` : b.accountName,
            `vence ${b.dueOn}`,
            `falta ${formatCents(b.remainingCents)}`,
            billStatusLabel(b.status, b.accountKind),
          ),
        ),
      )
    }
  }

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
          // v1.1 — 2026-09-27: de onde veio o dinheiro, e o pagamento de fatura pelo nome.
          e.source === 'credit_bill'
            ? `pagamento da fatura do ${creditName(e.creditAccountId) ?? 'cartão'}`
            : e.creditAccountId
              ? `${e.kind === 'expense' ? 'no' : 'veio do'} ${creditName(e.creditAccountId) ?? 'cartão'}` +
                (e.chargeCount > 1 ? ` em ${e.chargeCount}x` : '') +
                (e.interestCents > 0 ? `, ${formatCents(e.interestCents)} de juros` : '')
              : null,
          // Parcela e conta fixa não se editam como lançamento solto: quem muda
          // o valor de uma parcela mexe no plano, não na linha gerada.
          e.source !== 'manual' && e.source !== 'credit_bill' ? `gerado por ${e.source}` : null,
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
    validCreditAccountIds: new Set(ledger.accounts.map((a) => a.id)),
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

CARTÃO E EMPRÉSTIMO:
- Gasto "no cartão", "no crédito", "no Nubank": create_entry com credit_account_id do cartão e occurred_on = a data do GASTO (não a da fatura). Omita charge_first_due_on: o app calcula a fatura em que a compra cai. Débito, Pix e dinheiro saem do saldo: sem credit_account_id.
- Compra parcelada no cartão ("3x no cartão"): create_installment_plan com credit_account_id e first_due_on = a data da compra.
- Assinatura cobrada no cartão todo mês: create_recurring com credit_account_id.
- Pegou dinheiro emprestado ("peguei 5 mil de empréstimo, pago em 10x"): create_entry kind=income com credit_account_id do empréstimo, charge_count = parcelas e, se a pessoa disse o total com juros, charge_total_cents. Esse dinheiro não é renda.
- "Paguei a fatura": pay_credit_bill com account_id e due_on da lista FATURAS A PAGAR; sem valor dito, amount_cents = o que falta. NUNCA use create_entry para pagar fatura.
- Se a pessoa falou de um cartão ou empréstimo que não está no contexto, não invente: responda em texto pedindo para cadastrá-lo em Cartões.

OUTRAS CONVENÇÕES:
- Se a pessoa já gastou ou já recebeu, is_settled = true. Se é conta a pagar ou a receber, false.
- Escolha a categoria mais próxima entre as do contexto. Só crie categoria nova se nenhuma servir mesmo; nesse caso chame create_category primeiro e, nas operações seguintes, informe category_name com o mesmo nome.
- Várias coisas numa frase só viram várias chamadas de ferramenta, na ordem em que foram ditas.
- Descrições curtas e em português, como a pessoa falaria: "Mercado", "Aluguel", "Uber".
- Nada do que você propuser é executado antes de a pessoa confirmar na tela. Proponha o que entendeu; não peça permissão em texto.`
