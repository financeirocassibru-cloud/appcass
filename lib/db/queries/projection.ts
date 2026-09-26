import { getCurrentBalance } from '@/lib/db/queries/balance'
import { listActiveRecurringRules } from '@/lib/db/queries/recurring'
import { listGoalsForProjection } from '@/lib/db/queries/goals'
import { getScenario } from '@/lib/db/queries/scenarios'
import { addDays, todayISO, type ISODate } from '@/lib/finance/date'
import { entriesAheadOf, projectRange, rollOverdueTo } from '@/lib/finance/projection'
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

const PROJECTION_COLUMNS = `
  id, kind, occurred_on, description, amount_cents, category_id,
  is_settled, source, source_id, occurrence_key,
  installment_number, installment_total
` as const

export async function getProjection(
  horizonDays = 90,
  today: ISODate = todayISO(),
  scenarioId?: string,
): Promise<Projection> {
  const to = addDays(today, horizonDays)

  const [balance, rules, entries, goals, scenario] = await Promise.all([
    getCurrentBalance(today),
    listActiveRecurringRules(),
    listEntriesForProjection(today, to),
    listGoalsForProjection(),
    scenarioId ? getScenario(scenarioId) : Promise.resolve(null),
  ])

  // Só o que ainda não está no saldo — a divisão exata contra `computeBalance`.
  const ahead = entriesAheadOf(entries, today)

  // O que venceu e não foi pago continua devido. Empurrar para o primeiro dia é
  // uma suposição, e a tela diz isso; deixar de fora seria pior, porque a
  // projeção pareceria melhor do que é.
  const overdue = ahead.filter((entry) => entry.occurredOn < today)
  const overdueCents = overdue.reduce(
    (total, entry) => total + (entry.kind === 'expense' ? entry.amountCents : -entry.amountCents),
    0,
  )

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

  return (data ?? []).map((row) => ({
    id: row.id,
    kind: row.kind,
    occurredOn: row.occurred_on,
    description: row.description,
    amountCents: Number(row.amount_cents),
    categoryId: row.category_id,
    isSettled: row.is_settled,
    source: row.source,
    sourceId: row.source_id,
    occurrenceKey: row.occurrence_key,
    installmentNumber: row.installment_number,
    installmentTotal: row.installment_total,
  }))
}
