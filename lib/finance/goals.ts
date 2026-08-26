import {
  endOfMonth,
  isAfter,
  monthKey,
  monthsBetween,
  startOfMonth,
  type ISODate,
} from './date'
import { splitCents } from './money'
import type { Goal, Occurrence } from './types'

/**
 * Aporte mensal de uma meta.
 *
 * Se a meta define `monthlyContributionCents`, é esse o valor. Senão, o que
 * falta é dividido pelos meses que restam até `targetDate`.
 *
 * O app antigo dividia o valor total pela quantidade de meses do planejamento
 * (`valorTotal / months.length`), o que ignorava tanto o prazo real da meta
 * quanto o que já havia sido guardado.
 */
export function monthlyContributionCents(goal: Goal, referenceDate: ISODate): number {
  if (goal.monthlyContributionCents !== null) {
    return goal.monthlyContributionCents
  }

  const remaining = goal.targetAmountCents - goal.savedCents
  if (remaining <= 0) return 0
  if (goal.targetDate === null) return 0

  // O mês da data-objetivo conta como mês de aporte.
  const monthsLeft = monthsBetween(referenceDate, goal.targetDate) + 1
  if (monthsLeft <= 0) return remaining

  const parts = splitCents(remaining, monthsLeft)
  return parts[0] ?? 0
}

/**
 * Expande os aportes de uma meta no intervalo, um por mês.
 *
 * O aporte cai no último dia do mês — mesma convenção do app antigo, onde as
 * metas eram lançadas em `dias[ultimoDia - 1]`.
 */
export function expandGoal(goal: Goal, from: ISODate, to: ISODate): Occurrence[] {
  if (goal.archivedAt !== null) return []
  if (isAfter(from, to)) return []
  if (goal.savedCents >= goal.targetAmountCents) return []

  const occurrences: Occurrence[] = []
  let cursor = startOfMonth(from)

  while (!isAfter(cursor, to)) {
    // Não projeta aporte depois do prazo da meta.
    if (goal.targetDate !== null && isAfter(cursor, goal.targetDate)) break

    const amountCents = monthlyContributionCents(goal, cursor)
    const date = endOfMonth(cursor)

    if (amountCents > 0 && date >= from && date <= to) {
      occurrences.push({
        key: `goal:${goal.id}:${monthKey(date)}`,
        date,
        kind: 'expense',
        amountCents,
        description: `Meta: ${goal.name}`,
        origin: 'goal',
        sourceId: goal.id,
        categoryId: null,
        isRealized: false,
        isSettled: false,
      })
    }

    cursor = startOfMonth(addOneMonth(cursor))
  }

  return occurrences
}

function addOneMonth(date: ISODate): ISODate {
  const [year, month] = date.split('-').map(Number) as [number, number, number]
  return month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, '0')}-01`
}
