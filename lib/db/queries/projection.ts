import { getCurrentBalance } from '@/lib/db/queries/balance'
import { listActiveRecurringRules } from '@/lib/db/queries/recurring'
import { addDays, todayISO, type ISODate } from '@/lib/finance/date'
import { entriesAheadOf, projectRange, rollOverdueTo } from '@/lib/finance/projection'
import type { DayProjection, Entry } from '@/lib/finance/types'
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
 * Metas ainda não existem (fase 6), então entram como lista vazia. O motor já
 * as aceita.
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
}

const PROJECTION_COLUMNS = `
  id, kind, occurred_on, description, amount_cents, category_id,
  is_settled, source, source_id, occurrence_key,
  installment_number, installment_total
` as const

export async function getProjection(
  horizonDays = 90,
  today: ISODate = todayISO(),
): Promise<Projection> {
  const to = addDays(today, horizonDays)

  const [balance, rules, entries] = await Promise.all([
    getCurrentBalance(today),
    listActiveRecurringRules(),
    listEntriesForProjection(today, to),
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
    openingBalanceCents: balance.currentCents,
    data: {
      entries: rollOverdueTo(ahead, today),
      recurringRules: rules,
      goals: [],
    },
  })

  const firstNegative = days.find((day) => day.balanceCents < 0)

  return {
    days,
    from: today,
    to,
    openingBalanceCents: balance.currentCents,
    firstNegativeDay: firstNegative?.date ?? null,
    overdueCents,
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
