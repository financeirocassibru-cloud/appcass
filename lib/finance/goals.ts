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
 * v1.1 — 28/09/2026 (Fase 14): `goal.planOverrides` — o valor que a pessoa fixou para um mês na
 * planilha ("Só este mês"). O mês fixado recebe esse valor, e o que falta é rateado entre os
 * outros, para a soma continuar fechando com o faltante.
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
  // v1.1 — 28/09/2026: o mês com valor fixado pela planilha ("só este mês") recebe esse valor.
  const fixedByMonth = planOverrideMap(goal)

  if (goal.monthlyContributionCents !== null) {
    const fixed = goal.monthlyContributionCents
    let left = remaining
    return months.map((month) => {
      const amount = Math.min(fixedByMonth.get(month) ?? fixed, left)
      left -= amount
      return amount > 0 ? amount : 0
    })
  }

  // Sem prazo não há como derivar o mensal, e chutar um valor seria pior que
  // não mostrar: a projeção ficaria errada sem a pessoa saber por quê.
  // v1.1 — 28/09/2026: menos no mês que a pessoa fixou — ali o valor é dela.
  if (goal.targetDate === null) {
    let left = remaining
    return months.map((month) => {
      const amount = Math.min(fixedByMonth.get(month) ?? 0, left)
      left -= amount
      return amount > 0 ? amount : 0
    })
  }

  const first = months[0]
  if (first === undefined) return []

  const horizonMonths = monthsBetween(first, goal.targetDate) + 1
  if (horizonMonths <= 0) return months.map((_, index) => (index === 0 ? remaining : 0))

  if (fixedByMonth.size === 0) return splitCents(remaining, horizonMonths)

  // v1.1 — 28/09/2026: com meses fixados, o horizonte inteiro é montado — os fixados com o valor
  // deles (limitado ao que falta) e o resto rateado entre os demais meses. A soma continua sendo
  // exatamente o que falta, a menos que os fixados sozinhos passem disso.
  const horizon: ISODate[] = []
  for (let cursor = first; horizon.length < horizonMonths; cursor = addOneMonth(cursor)) {
    horizon.push(cursor)
  }
  let left = remaining
  const fixedAmounts = horizon.map((month) => {
    const value = fixedByMonth.get(month)
    if (value === undefined) return null
    const amount = Math.min(value, left)
    left -= amount
    return amount
  })
  const freeCount = fixedAmounts.filter((amount) => amount === null).length
  const shares = freeCount > 0 ? splitCents(left, freeCount) : []
  let shareIndex = 0
  return horizon.map((_, index) => {
    const fixedAmount = fixedAmounts[index]
    if (fixedAmount !== null && fixedAmount !== undefined) return fixedAmount
    const share = shares[shareIndex] ?? 0
    shareIndex += 1
    return share
  })
}

/** v1.1 — 28/09/2026: os meses fixados, pelo 1º dia do mês. */
function planOverrideMap(goal: Goal): Map<ISODate, number> {
  const map = new Map<ISODate, number>()
  for (const override of goal.planOverrides ?? []) {
    map.set(startOfMonth(override.month), override.amountCents)
  }
  return map
}

function addOneMonth(date: ISODate): ISODate {
  const [year, month] = date.split('-').map(Number) as [number, number, number]
  return month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, '0')}-01`
}
