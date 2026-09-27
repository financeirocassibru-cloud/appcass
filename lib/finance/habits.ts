import {
  compareISO,
  daysInMonth,
  isWithin,
  isoWeekday,
  monthKey,
  parseISODate,
  toISODate,
  type ISODate,
} from './date'
import type { Entry, EntryKind } from './types'

/**
 * "Duplicar hábitos": repetir o jeito de gastar de um mês nos meses seguintes de um cenário.
 *
 * v1.1 — 2026-09-27 (antes v1.0 — 2026-09-27). v1.1: o mês atual, em aberto, pode ser a
 * origem (`habitSourceMonths`).
 *
 * Só o que **não** tem recorrência programada vira hábito: lançamento avulso (`source =
 * 'manual'`, o que inclui o importado de extrato). Conta fixa, renda fixa, parcela e aporte de
 * meta já aparecem na projeção pela própria regra — duplicá-los contaria cada um duas vezes.
 *
 * O resultado vira `scenario_entries`, itens hipotéticos do cenário, e não uma cópia dos
 * lançamentos no mesmo lugar (invariante 6): são suposições datadas em outros meses, sem
 * vínculo de escrita com `entries`. Cada uma pode ser editada ou apagada sozinha.
 *
 * Pura (invariante 9): a janela válida — que já embute "hoje" — entra por parâmetro.
 */

export type HabitKinds = 'all' | EntryKind

/** Um item a gravar em `scenario_entries`. */
export interface HabitCopy {
  kind: EntryKind
  description: string
  amountCents: number
  occursOn: ISODate
  categoryId: string | null
}

export interface HabitTotals {
  count: number
  cents: number
}

export interface HabitSummary {
  expense: HabitTotals
  income: HabitTotals
}

const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/

export function isMonthKey(value: string): boolean {
  return MONTH_KEY.test(value)
}

/** Desloca um `YYYY-MM` em N meses, sem passar por `Date`. */
export function shiftMonthKey(month: string, delta: number): string {
  const { year, month: m } = parseISODate(`${month}-01`)
  const zeroBased = year * 12 + (m - 1) + delta
  const newYear = Math.floor(zeroBased / 12)
  const newMonth = (zeroBased % 12) + 1
  return `${newYear}-${String(newMonth).padStart(2, '0')}`
}

/**
 * Leva uma data para outro mês mantendo **o dia da semana e a posição dele no mês**.
 *
 * O lazer do 2º sábado de agosto vira o do 2º sábado de setembro, e não o do dia 8 — que em
 * setembro de 2026 é uma terça. Hábito segue a semana, não o calendário.
 *
 * Se o mês de destino não tem o n-ésimo daquele dia (o 5º sábado), cai no último que existe:
 * o gasto continua no fim do mês, que é o que ele era.
 */
export function alignWeekdayToMonth(date: ISODate, targetMonth: string): ISODate {
  const { day } = parseISODate(date)
  const weekday = isoWeekday(date)
  const nth = Math.ceil(day / 7)

  const { year, month } = parseISODate(`${targetMonth}-01`)
  const firstOfMonth = toISODate({ year, month, day: 1 })
  const firstMatch = 1 + ((weekday - isoWeekday(firstOfMonth) + 7) % 7)

  let targetDay = firstMatch + (nth - 1) * 7
  if (targetDay > daysInMonth(year, month)) targetDay -= 7

  return toISODate({ year, month, day: targetDay })
}

/**
 * Os meses que recebem o hábito.
 *
 * Sempre depois do mês de origem (repetir agosto em agosto dobraria o que já aconteceu) e
 * dentro do cenário. Sem `range`, são todos até o fim do cenário; com ele, só o intervalo.
 */
export function habitTargetMonths({
  sourceMonth,
  from,
  to,
  range,
}: {
  sourceMonth: string
  from: ISODate
  to: ISODate
  range?: { from: string; to: string } | null
}): string[] {
  let first = monthKey(from)
  let last = monthKey(to)
  const afterSource = shiftMonthKey(sourceMonth, 1)
  if (first < afterSource) first = afterSource
  if (range) {
    if (range.from > first) first = range.from
    if (range.to < last) last = range.to
  }

  const months: string[] = []
  for (let month = first; month <= last; month = shiftMonthKey(month, 1)) months.push(month)
  return months
}

/**
 * Os itens hipotéticos que o hábito gera.
 *
 * `from`/`to` é a janela em que um item pode cair: o maior entre o início do cenário e hoje,
 * até o fim do cenário. Um item datado no passado seria ignorado pela projeção
 * (`projectWindow` aplica o cenário só à previsão), e gravá-lo só criaria lixo invisível.
 */
export function duplicateHabits({
  entries,
  sourceMonth,
  targetMonths,
  kinds,
  from,
  to,
}: {
  entries: readonly (Pick<
    Entry,
    'kind' | 'description' | 'amountCents' | 'occurredOn' | 'categoryId' | 'source'
  > & { creditAccountId?: string | null })[]
  sourceMonth: string
  targetMonths: readonly string[]
  kinds: HabitKinds
  from: ISODate
  to: ISODate
}): HabitCopy[] {
  const habits = entries.filter(
    (entry) =>
      entry.source === 'manual' &&
      // v1.2 — 2026-09-27 (Fase 13): o dinheiro que veio de empréstimo/cartão não é hábito de
      // renda. A compra no cartão continua sendo hábito — o gasto se repete, e no cenário ele
      // entra no dia dele (a fatura real é que o junta no vencimento).
      !(entry.kind === 'income' && entry.creditAccountId) &&
      monthKey(entry.occurredOn) === sourceMonth &&
      (kinds === 'all' || entry.kind === kinds),
  )

  const copies: HabitCopy[] = []
  for (const month of targetMonths) {
    for (const entry of habits) {
      const occursOn = alignWeekdayToMonth(entry.occurredOn, month)
      if (!isWithin(occursOn, from, to)) continue
      copies.push({
        kind: entry.kind,
        description: entry.description,
        amountCents: entry.amountCents,
        occursOn,
        categoryId: entry.categoryId,
      })
    }
  }

  return copies.sort((a, b) => compareISO(a.occursOn, b.occursOn))
}

/** Contagem e total por tipo — o que a tela mostra antes de perguntar o que duplicar. */
export function summarizeHabits(copies: readonly HabitCopy[]): HabitSummary {
  const summary: HabitSummary = {
    expense: { count: 0, cents: 0 },
    income: { count: 0, cents: 0 },
  }
  for (const copy of copies) {
    summary[copy.kind].count += 1
    summary[copy.kind].cents += copy.amountCents
  }
  return summary
}

/** O primeiro dia em que um item hipotético ainda conta: o maior entre início e hoje. */
export function habitWindowStart(scenarioStartsOn: ISODate, today: ISODate): ISODate {
  return compareISO(scenarioStartsOn, today) >= 0 ? scenarioStartsOn : today
}

/**
 * Os meses que podem ser origem do hábito, do mais recente ao mais antigo: o mês atual —
 * ainda em aberto — e os N−1 anteriores.
 *
 * v1.1 — 2026-09-27: o mês atual entrou (antes era `closedMonthsBefore`, só meses
 * fechados). Em setembro não dava para repetir setembro, que é justamente o retrato mais
 * fresco de como a pessoa está gastando. Não dobra nada: `habitTargetMonths` continua
 * começando no mês **seguinte** à origem, e do mês em aberto só entra o que já foi lançado.
 */
export function habitSourceMonths(today: ISODate, count: number): string[] {
  const current = monthKey(today)
  return Array.from({ length: count }, (_, index) => shiftMonthKey(current, -index))
}
