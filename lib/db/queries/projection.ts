import { getBalanceAnchor, getCurrentBalance } from '@/lib/db/queries/balance'
import { computeBalance, type BalanceEntry } from '@/lib/finance/balance'
import { listActiveRecurringRules } from '@/lib/db/queries/recurring'
import { listGoalsForProjection } from '@/lib/db/queries/goals'
import { getScenario } from '@/lib/db/queries/scenarios'
import { getCreditLedger } from '@/lib/db/queries/credit'
import { isBillDue, isCashEntry, type CreditBill } from '@/lib/finance/credit'
import { addDays, todayISO, type ISODate } from '@/lib/finance/date'
import { MAX_WINDOW_DAYS } from '@/lib/finance/buckets'
import {
  entriesAheadOf,
  projectRange,
  projectWindow,
  rollOverdueTo,
} from '@/lib/finance/projection'
import type { DayProjection, Entry, Scenario } from '@/lib/finance/types'
import { createClient } from '@/lib/supabase/server'

/**
 * Monta a projeção de saldo dia a dia.
 *
 * O ponto de partida é o **saldo de hoje**, e não a âncora: projetar desde a
 * âncora obrigaria a reprocessar meses de histórico para chegar ao mesmo
 * número que `getCurrentBalance` já calculou.
 *
 * Daí vem o cuidado central desta query. O saldo atual já embute todo lançamento
 * liquidado até hoje; a projeção só pode acrescentar o que ainda não está lá.
 * `entriesAheadOf()` faz essa divisão, e é o complemento exato de
 * `computeBalance()` — sem ela, o gasto liquidado hoje seria descontado duas
 * vezes, e o saldo projetado sairia menor que a realidade.
 *
 * As metas entram como aporte mensal projetado: `expandGoal()` deriva o valor
 * do que falta e do prazo, e o lança no último dia de cada mês. Uma meta
 * arquivada ou já cumprida não gera aporte — quem decide isso é o motor.
 */

export interface Projection {
  days: DayProjection[]
  from: ISODate
  to: ISODate
  openingBalanceCents: number
  /** Primeiro dia em que o saldo fica negativo — o alerta da tela. */
  firstNegativeDay: ISODate | null
  /** Quanto veio de contas já vencidas, empurradas para o primeiro dia. */
  overdueCents: number
  /** O cenário aplicado, ou `null` quando a projeção é a real. */
  scenario: Scenario | null
}

// v1.2 — 2026-09-27 (Fase 13): de onde veio o dinheiro — a saída no cartão sai da projeção de
// caixa, e a fatura (de `getCreditLedger`) entra no lugar.
const PROJECTION_COLUMNS = `
  id, kind, occurred_on, description, amount_cents, category_id,
  is_settled, source, source_id, occurrence_key,
  installment_number, installment_total,
  credit_account_id, charge_first_due_on, charge_count, interest_cents
` as const

/**
 * v1.2 — 2026-09-27 (Fase 13): quanto já venceu e não foi pago, em caixa: os pendentes do saldo
 * (a compra no cartão não — quem vence é a fatura) e o restante das faturas vencidas.
 */
function overdueCashCents(entries: readonly Entry[], bills: readonly CreditBill[], today: ISODate): number {
  const fromEntries = entries
    .filter((entry) => !entry.isSettled && entry.occurredOn < today && isCashEntry(entry))
    .reduce((total, entry) => total + (entry.kind === 'expense' ? entry.amountCents : -entry.amountCents), 0)
  const fromBills = bills
    .filter((bill) => isBillDue(bill) && bill.dueOn < today)
    .reduce((total, bill) => total + bill.remainingCents, 0)
  return fromEntries + fromBills
}

export async function getProjection(
  horizonDays = 90,
  today: ISODate = todayISO(),
  scenarioId?: string,
): Promise<Projection> {
  const to = addDays(today, horizonDays)

  const [balance, rules, entries, goals, scenario, ledger] = await Promise.all([
    getCurrentBalance(today),
    listActiveRecurringRules(),
    listEntriesForProjection(today, to),
    listGoalsForProjection(),
    scenarioId ? getScenario(scenarioId) : Promise.resolve(null),
    getCreditLedger(today),
  ])

  // Só o que ainda não está no saldo — a divisão exata contra `computeBalance`.
  const ahead = entriesAheadOf(entries, today)

  // O que venceu e não foi pago continua devido. Empurrar para o primeiro dia é
  // uma suposição, e a tela diz isso; deixar de fora seria pior, porque a
  // projeção pareceria melhor do que é.
  const overdueCents = overdueCashCents(ahead, ledger.bills, today)

  const days = projectRange({
    from: today,
    to,
    // O cenário parte do mesmo saldo real. `scenarios.opening_balance_cents`
    // existe para o caso "e se eu tivesse X", e só vale quando foi informado —
    // zero significa "usa o saldo de verdade", pela mesma razão que a âncora do
    // saldo trata zero como não configurada.
    openingBalanceCents:
      scenario && scenario.openingBalanceCents !== 0
        ? scenario.openingBalanceCents
        : balance.currentCents,
    data: {
      entries: rollOverdueTo(ahead, today),
      recurringRules: rules,
      goals,
      creditBills: ledger.bills,
    },
    scenario: scenario ?? undefined,
  })

  const firstNegative = days.find((day) => day.balanceCents < 0)

  return {
    days,
    from: today,
    to,
    openingBalanceCents: balance.currentCents,
    firstNegativeDay: firstNegative?.date ?? null,
    overdueCents,
    scenario,
  }
}

/**
 * Lançamentos que podem afetar a projeção.
 *
 * O limite superior é o fim da janela; o inferior **não existe**, porque uma
 * conta atrasada de meses atrás continua devida. `entriesAheadOf` descarta os
 * liquidados logo em seguida, então o que vem a mais daqui é barato.
 */
async function listEntriesForProjection(today: ISODate, to: ISODate): Promise<Entry[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('entries')
    .select(PROJECTION_COLUMNS)
    .lte('occurred_on', to)
    // Liquidado e antigo já está no saldo: buscar anos de histórico para
    // descartar tudo em seguida seria desperdício. O corte pega os pendentes
    // antigos (que interessam) sem arrastar o histórico liquidado inteiro.
    .or(`is_settled.eq.false,occurred_on.gte.${today}`)

  if (error) throw new Error(`Falha ao ler lançamentos da projeção: ${error.message}`)

  return (data ?? []).map(toProjectionEntry)
}

/**
 * Uma linha de `entries` como o motor a espera.
 *
 * v1.1 — 2026-09-26: extraída porque três queries passaram a montar o mesmo objeto. Duas
 * cópias divergiriam na primeira coluna nova, e a que ficasse para trás devolveria `undefined`
 * num campo que o motor lê — silenciosamente.
 */
function toProjectionEntry(row: {
  id: string
  kind: Entry['kind']
  occurred_on: string
  description: string
  amount_cents: number
  category_id: string | null
  is_settled: boolean
  source: Entry['source']
  source_id: string | null
  occurrence_key: string | null
  installment_number: number | null
  installment_total: number | null
  credit_account_id: string | null
  charge_first_due_on: string | null
  charge_count: number
  interest_cents: number
}): Entry {
  return {
    id: row.id,
    kind: row.kind,
    occurredOn: row.occurred_on,
    description: row.description,
    // `bigint` chega como number no supabase-js; `amount_cents` tem teto validado bem abaixo
    // de 2^53.
    amountCents: Number(row.amount_cents),
    categoryId: row.category_id,
    isSettled: row.is_settled,
    source: row.source,
    sourceId: row.source_id,
    occurrenceKey: row.occurrence_key,
    installmentNumber: row.installment_number,
    installmentTotal: row.installment_total,
    creditAccountId: row.credit_account_id,
    chargeFirstDueOn: row.charge_first_due_on,
    chargeCount: row.charge_count,
    interestCents: Number(row.interest_cents),
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * v1.1 — 2026-09-26: a janela da Análise, que atravessa passado e futuro.
 *
 * `getProjection` acima continua como estava — o diagnóstico da IA depende dela e ela responde
 * a uma pergunta mais estreita: "o que vem pela frente". O que segue responde "como foi e como
 * vai ser", numa curva só.
 * ──────────────────────────────────────────────────────────────────────────── */

// O teto da janela mora em `lib/finance/buckets`, que a tela pode importar; reexportado aqui
// para quem já lê este módulo.
export { MAX_WINDOW_DAYS }

export interface ProjectionWindow {
  days: DayProjection[]
  /**
   * A mesma janela **sem** o cenário, para a tela poder mostrar as duas curvas. `null` quando
   * não há cenário aplicado. Sai de uma segunda passada da função pura sobre os dados já
   * buscados — custo desprezível, e é o que faltava para dar para ver o efeito do cenário em
   * vez de só o resultado dele.
   */
  realDays: DayProjection[] | null
  /** O que foi pedido na URL, antes de qualquer corte. */
  requestedFrom: ISODate
  /** O que foi possível calcular: nunca antes da âncora, nunca começando depois de hoje. */
  from: ISODate
  to: ISODate
  today: ISODate
  /** Primeiro dia de histórico conhecido — o batente esquerdo do arrasto. */
  historyStartsOn: ISODate
  /** `true` quando o pedido foi cortado por bater na âncora. */
  isTruncatedAtAnchor: boolean
  isAnchorConfigured: boolean
  /** Saldo no fim do dia anterior a `from`. */
  openingBalanceCents: number
  /** O saldo de hoje — o mesmo número que o Início mostra. */
  currentBalanceCents: number
  /** Primeiro dia negativo **de hoje para frente**: é o alerta, não o histórico. */
  firstNegativeDay: ISODate | null
  /** Primeiro dia negativo dentro da janela, inclusive no passado. */
  firstNegativeDayInWindow: ISODate | null
  /** Quanto veio de contas já vencidas. */
  overdueCents: number
  /** `true` quando a janela termina antes de hoje e o vencido não tinha onde cair. */
  overdueIsOutsideWindow: boolean
  scenario: Scenario | null
}

/**
 * Monta a janela da Análise.
 *
 * Dois cortes que parecem zelo e são correção:
 *
 * **A janela nunca começa antes da âncora.** `getCurrentBalance(d)` com `d` anterior à âncora
 * cai no atalho de janela vazia e devolve o próprio valor da âncora — que já embute tudo que
 * foi liquidado antes dela. Acumular esses lançamentos em cima disso os contaria **duas vezes**,
 * falsificando o histórico e, pela costura, o saldo de hoje. Antes da âncora o app simplesmente
 * não sabe qual era o saldo, e a tela diz isso em vez de inventar.
 *
 * **A janela de cálculo sempre alcança hoje**, mesmo quando a visível começa depois. O saldo
 * num dia futuro, calculado só com liquidados, ignoraria todo pendente e toda recorrência entre
 * hoje e lá — a projeção pareceria melhor do que é, que é o erro que este módulo inteiro existe
 * para não cometer.
 */
export async function getWindow(options: {
  from: ISODate
  to: ISODate
  today?: ISODate
  scenarioId?: string
}): Promise<ProjectionWindow> {
  const today = options.today ?? todayISO()
  const requestedFrom = options.from

  const anchor = await getBalanceAnchor()
  const historyStartsOn = anchor.openingBalanceOn

  // `max(âncora, min(pedido, hoje))`, com comparação de string — datas ISO ordenam
  // lexicograficamente, e é como o resto do módulo compara (invariante 2).
  const notAfterToday = requestedFrom > today ? today : requestedFrom
  const from = notAfterToday < historyStartsOn ? historyStartsOn : notAfterToday
  const capped = addDays(from, MAX_WINDOW_DAYS)
  const to = options.to > capped ? capped : options.to

  const reachesFuture = to >= today

  const [settledSoFar, windowEntries, overduePending, rules, goals, scenario, ledger] =
    await Promise.all([
      listSettledUpTo(historyStartsOn, today),
      listEntriesInWindow(from, to),
      reachesFuture ? listOverduePending(today) : Promise.resolve([]),
      listActiveRecurringRules(),
      listGoalsForProjection(),
      options.scenarioId ? getScenario(options.scenarioId) : Promise.resolve(null),
      getCreditLedger(today),
    ])

  // Os dois saldos saem da **mesma** leitura, variando só a data de corte: o do dia anterior a
  // `from`, que é de onde a curva parte, e o de hoje, que é o número que a tela mostra. Com
  // duas queries eles poderiam discordar entre si na virada de um segundo.
  const balanceAt = (date: ISODate) =>
    computeBalance({
      openingBalanceCents: anchor.openingBalanceCents,
      openingBalanceOn: historyStartsOn,
      today: date,
      entries: settledSoFar,
    }).currentCents

  const openingBalanceCents = balanceAt(addDays(from, -1))
  const currentBalanceCents = balanceAt(today)

  // Um pendente antigo volta nas duas leituras quando a janela o alcança; a função pura não
  // deve ver id repetido.
  const byId = new Map<string, Entry>()
  for (const entry of [...windowEntries, ...overduePending]) byId.set(entry.id, entry)
  const entries = [...byId.values()]

  const data = { entries, recurringRules: rules, goals, creditBills: ledger.bills }
  const common = { from, to, today, openingBalanceCents, data }

  const days = projectWindow({
    ...common,
    // `scenarios.opening_balance_cents` existe para o "e se eu tivesse X"; zero significa
    // "usa o saldo de verdade", como a âncora também trata zero.
    openingBalanceCents:
      scenario && scenario.openingBalanceCents !== 0
        ? scenario.openingBalanceCents
        : openingBalanceCents,
    scenario: scenario ?? undefined,
  })
  const realDays = scenario ? projectWindow(common) : null

  const overdueCents = overdueCashCents(entries, ledger.bills, today)

  return {
    days,
    realDays,
    requestedFrom,
    from,
    to,
    today,
    historyStartsOn,
    isTruncatedAtAnchor: requestedFrom < historyStartsOn,
    isAnchorConfigured: anchor.isConfigured,
    openingBalanceCents,
    currentBalanceCents,
    firstNegativeDay: days.find((day) => day.date >= today && day.balanceCents < 0)?.date ?? null,
    firstNegativeDayInWindow: days.find((day) => day.balanceCents < 0)?.date ?? null,
    overdueCents,
    overdueIsOutsideWindow: !reachesFuture && overdueCents !== 0,
    scenario,
  }
}

/** Liquidados desde a âncora até `to` — a matéria-prima dos dois saldos. */
async function listSettledUpTo(from: ISODate, to: ISODate): Promise<BalanceEntry[]> {
  if (from > to) return []

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('entries')
    .select('kind, amount_cents, occurred_on, is_settled')
    .eq('is_settled', true)
    .gte('occurred_on', from)
    .lte('occurred_on', to)

  if (error) throw new Error(`Falha ao calcular o saldo da janela: ${error.message}`)

  return (data ?? []).map((row) => ({
    kind: row.kind,
    amountCents: Number(row.amount_cents),
    occurredOn: row.occurred_on,
    isSettled: row.is_settled,
  }))
}

/**
 * Tudo que caiu dentro da janela, liquidado ou não.
 *
 * Sem regra de negócio: quem decide o que fazer com cada linha é `projectWindow`. O filtro de
 * `listEntriesForProjection` não serve aqui — ele exclui justamente os liquidados antigos, que
 * **são** o histórico. Cai em `entries_user_date_idx (user_id, occurred_on desc)`.
 */
async function listEntriesInWindow(from: ISODate, to: ISODate): Promise<Entry[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('entries')
    .select(PROJECTION_COLUMNS)
    .gte('occurred_on', from)
    .lte('occurred_on', to)

  if (error) throw new Error(`Falha ao ler os lançamentos da janela: ${error.message}`)
  return (data ?? []).map(toProjectionEntry)
}

/**
 * Pendentes vencidos antes de hoje, sem limite inferior: uma conta de março continua devida em
 * setembro. Cai no índice parcial `entries_user_pending_idx (user_id, occurred_on) where not
 * is_settled`.
 */
async function listOverduePending(today: ISODate): Promise<Entry[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('entries')
    .select(PROJECTION_COLUMNS)
    .eq('is_settled', false)
    .lt('occurred_on', today)

  if (error) throw new Error(`Falha ao ler as contas vencidas: ${error.message}`)
  return (data ?? []).map(toProjectionEntry)
}
