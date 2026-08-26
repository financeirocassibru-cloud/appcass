import {
  addDays,
  addMonths,
  clampDayToMonth,
  isAfter,
  monthKey,
  parseISODate,
  toISODate,
  type ISODate,
} from './date'
import type { Occurrence, RecurringRule } from './types'

/**
 * Expande uma regra recorrente em ocorrências dentro do intervalo.
 *
 * A chave de cada ocorrência (`occurrenceKey`) é o que permite ao motor de
 * projeção descartar a projeção quando o lançamento real já existe. Para regra
 * mensal a chave é `YYYY-MM`; para as demais, a própria data.
 */
export function expandRecurringRule(
  rule: RecurringRule,
  from: ISODate,
  to: ISODate,
): Occurrence[] {
  if (!rule.isActive) return []
  if (isAfter(from, to)) return []

  // A regra só vale de `startsOn` até `endsOn`, se houver.
  const windowStart = rule.startsOn > from ? rule.startsOn : from
  const windowEnd = rule.endsOn !== null && rule.endsOn < to ? rule.endsOn : to
  if (isAfter(windowStart, windowEnd)) return []

  const dates =
    rule.frequency === 'monthly'
      ? monthlyDates(rule, windowStart, windowEnd)
      : rule.frequency === 'weekly'
        ? weeklyDates(rule, windowStart, windowEnd)
        : yearlyDates(rule, windowStart, windowEnd)

  return dates.map((date) => {
    const key = rule.frequency === 'monthly' ? monthKey(date) : date
    return {
      key: `recurring:${rule.id}:${key}`,
      date,
      kind: rule.kind,
      amountCents: rule.amountCents,
      description: rule.description,
      origin: 'recurring' as const,
      sourceId: rule.id,
      categoryId: rule.categoryId,
      isRealized: false,
      isSettled: false,
    }
  })
}

/** Chave de ocorrência de uma regra numa data — a mesma que a expansão produz. */
export function recurrenceOccurrenceKey(rule: RecurringRule, date: ISODate): string {
  return rule.frequency === 'monthly' ? monthKey(date) : date
}

function monthlyDates(rule: RecurringRule, from: ISODate, to: ISODate): ISODate[] {
  // Sem dia de vencimento definido, cai no dia da data de início.
  const anchorDay = rule.dayOfMonth ?? parseISODate(rule.startsOn).day
  const dates: ISODate[] = []

  const cursor = { year: parseISODate(from).year, month: parseISODate(from).month }
  const last = parseISODate(to)

  while (cursor.year < last.year || (cursor.year === last.year && cursor.month <= last.month)) {
    const day = clampDayToMonth(anchorDay, cursor.year, cursor.month)
    const date = toISODate({ year: cursor.year, month: cursor.month, day })
    if (date >= from && date <= to) dates.push(date)

    cursor.month += 1
    if (cursor.month > 12) {
      cursor.month = 1
      cursor.year += 1
    }
  }

  return dates
}

function weeklyDates(rule: RecurringRule, from: ISODate, to: ISODate): ISODate[] {
  const dates: ISODate[] = []
  let date = rule.startsOn

  // Avança de 7 em 7 a partir do início da regra até entrar na janela.
  while (date < from) date = addDays(date, 7)
  while (date <= to) {
    dates.push(date)
    date = addDays(date, 7)
  }

  return dates
}

function yearlyDates(rule: RecurringRule, from: ISODate, to: ISODate): ISODate[] {
  const dates: ISODate[] = []
  let date = rule.startsOn

  while (date < from) date = addMonths(date, 12)
  while (date <= to) {
    dates.push(date)
    date = addMonths(date, 12)
  }

  return dates
}
