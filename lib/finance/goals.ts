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
 *
 * **O rateio é calculado uma vez, para o horizonte inteiro**, e não mês a mês.
 * A primeira versão desta função chamava `monthlyContributionCents(goal,
 * cursor)` dentro do laço, o que parecia natural e estava errado: a cada mês
 * ela recalculava "quanto falta dividido pelos meses restantes" sem contar os
 * aportes que ela mesma acabara de projetar. O resultado escalava —
 * R$ 6.000,00 em seis meses saía como 1.000 + 1.200 + 1.500 + 2.000 + 3.000 +
 * 6.000, ou seja, R$ 14.700,00 projetados para guardar R$ 6.000,00.
 *
 * O erro só apareceu quando as metas foram ligadas à projeção, porque até
 * então esta função não tinha teste próprio.
 *
 * A soma dos aportes projetados é exatamente o que falta, centavo a centavo,
 * porque o rateio usa `splitCents`.
 */
export function expandGoal(goal: Goal, from: ISODate, to: ISODate): Occurrence[] {
  if (goal.archivedAt !== null) return []
  if (isAfter(from, to)) return []

  const remaining = goal.targetAmountCents - goal.savedCents
  if (remaining <= 0) return []

  // Os meses que recebem aporte: do mês de `from` até `to`, sem passar do
  // prazo da meta.
  const months: ISODate[] = []
  let cursor = startOfMonth(from)
  while (!isAfter(cursor, to)) {
    if (goal.targetDate !== null && isAfter(cursor, goal.targetDate)) break
    months.push(cursor)
    cursor = startOfMonth(addOneMonth(cursor))
  }
  if (months.length === 0) return []

  const amounts = plannedAmounts(goal, months, remaining)

  const occurrences: Occurrence[] = []
  for (const [index, month] of months.entries()) {
    const amountCents = amounts[index] ?? 0
    if (amountCents <= 0) continue

    const date = endOfMonth(month)
    if (date < from || date > to) continue

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

  return occurrences
}

/**
 * Quanto cai em cada mês da janela.
 *
 * Com aporte mensal definido, é ele — **limitado ao que falta**: continuar
 * aportando depois de atingir a meta projetaria dinheiro saindo da conta sem
 * destino.
 *
 * Sem aporte definido, o que falta é dividido pelos meses até o prazo. O
 * denominador é o horizonte **da meta**, não o da janela consultada: quem olha
 * só os próximos 30 dias de uma meta que termina em dezembro tem de ver o
 * aporte de dezembro, não a meta inteira espremida num mês.
 */
function plannedAmounts(goal: Goal, months: readonly ISODate[], remaining: number): number[] {
  if (goal.monthlyContributionCents !== null) {
    const fixed = goal.monthlyContributionCents
    let left = remaining
    return months.map(() => {
      const amount = Math.min(fixed, left)
      left -= amount
      return amount > 0 ? amount : 0
    })
  }

  // Sem prazo não há como derivar o mensal, e chutar um valor seria pior que
  // não mostrar: a projeção ficaria errada sem a pessoa saber por quê.
  if (goal.targetDate === null) return months.map(() => 0)

  const first = months[0]
  if (first === undefined) return []

  const horizonMonths = monthsBetween(first, goal.targetDate) + 1
  if (horizonMonths <= 0) return months.map((_, index) => (index === 0 ? remaining : 0))

  return splitCents(remaining, horizonMonths)
}

function addOneMonth(date: ISODate): ISODate {
  const [year, month] = date.split('-').map(Number) as [number, number, number]
  return month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, '0')}-01`
}
