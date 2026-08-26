/**
 * Datas de competência como strings `YYYY-MM-DD`.
 *
 * O app antigo usava `new Date("2026-03-05")`, que o JavaScript interpreta como
 * meia-noite UTC — em UTC−3 isso vira 04/03 às 21h, e o lançamento "pulava" um
 * dia. Também usava `.toISOString().split('T')[0]` sobre um `Date` em horário
 * local, com o mesmo efeito na direção contrária.
 *
 * Aqui nenhuma função de calendário aceita ou devolve `Date`. Toda a aritmética
 * acontece sobre os componentes ano/mês/dia, sem fuso envolvido. `Date` aparece
 * uma única vez, em `todayISO`, para descobrir que dia é hoje num fuso
 * explícito.
 */

export const APP_TIMEZONE = 'America/Sao_Paulo'

/** Data de competência no formato `YYYY-MM-DD`. */
export type ISODate = string

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

export class DateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DateError'
  }
}

export interface DateParts {
  year: number
  month: number // 1-12
  day: number // 1-31
}

/** `true` se a string é uma data `YYYY-MM-DD` que existe no calendário. */
export function isISODate(value: string): value is ISODate {
  const match = ISO_DATE.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12) return false
  return day >= 1 && day <= daysInMonth(year, month)
}

export function parseISODate(value: string): DateParts {
  const match = ISO_DATE.exec(value)
  if (!match) {
    throw new DateError(`Data inválida: esperado YYYY-MM-DD, recebido "${value}"`)
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new DateError(`Data inexistente no calendário: "${value}"`)
  }
  return { year, month, day }
}

export function toISODate({ year, month, day }: DateParts): ISODate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

export function daysInMonth(year: number, month: number): number {
  if (month < 1 || month > 12) {
    throw new DateError(`Mês fora do intervalo 1-12: ${month}`)
  }
  if (month === 2) return isLeapYear(year) ? 29 : 28
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

/**
 * Ajusta um dia de vencimento ao mês de destino.
 *
 * Vencimento no dia 31 num mês de 30 dias cai no dia 30; em fevereiro, no 28 ou
 * 29. Reproduz o `ajustarDiaAoMes` do app antigo, agora coberto por teste — lá
 * a conta existia mas nunca foi verificada.
 */
export function clampDayToMonth(day: number, year: number, month: number): number {
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new DateError(`Dia fora do intervalo 1-31: ${day}`)
  }
  const last = daysInMonth(year, month)
  return day > last ? last : day
}

/** Compara duas datas ISO. Como o formato é ordenável, basta comparar strings. */
export function compareISO(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export function isBefore(a: ISODate, b: ISODate): boolean {
  return a < b
}

export function isAfter(a: ISODate, b: ISODate): boolean {
  return a > b
}

/** `true` se `date` está no intervalo fechado `[from, to]`. */
export function isWithin(date: ISODate, from: ISODate, to: ISODate): boolean {
  return date >= from && date <= to
}

/**
 * Soma meses preservando o dia quando possível.
 *
 * 31/01 mais um mês vira 28/02 (ou 29 em ano bissexto), não 03/03 — que é o
 * que `Date.prototype.setMonth` faz, por transbordar para o mês seguinte.
 */
export function addMonths(date: ISODate, months: number): ISODate {
  const { year, month, day } = parseISODate(date)
  const zeroBased = year * 12 + (month - 1) + months
  const newYear = Math.floor(zeroBased / 12)
  const newMonth = (zeroBased % 12) + 1
  return toISODate({ year: newYear, month: newMonth, day: clampDayToMonth(day, newYear, newMonth) })
}

export function addDays(date: ISODate, days: number): ISODate {
  let { year, month, day } = parseISODate(date)
  day += days

  while (day > daysInMonth(year, month)) {
    day -= daysInMonth(year, month)
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }
  while (day < 1) {
    month -= 1
    if (month < 1) {
      month = 12
      year -= 1
    }
    day += daysInMonth(year, month)
  }

  return toISODate({ year, month, day })
}

/** Primeiro dia do mês da data informada. */
export function startOfMonth(date: ISODate): ISODate {
  const { year, month } = parseISODate(date)
  return toISODate({ year, month, day: 1 })
}

/** Último dia do mês da data informada. */
export function endOfMonth(date: ISODate): ISODate {
  const { year, month } = parseISODate(date)
  return toISODate({ year, month, day: daysInMonth(year, month) })
}

/** Chave de mês `YYYY-MM`, usada como `occurrence_key` das recorrências. */
export function monthKey(date: ISODate): string {
  return date.slice(0, 7)
}

/** Meses entre duas datas, contando apenas ano e mês. `2026-01-31` → `2026-03-01` = 2. */
export function monthsBetween(from: ISODate, to: ISODate): number {
  const a = parseISODate(from)
  const b = parseISODate(to)
  return (b.year - a.year) * 12 + (b.month - a.month)
}

/** Todos os dias do intervalo fechado `[from, to]`, em ordem. */
export function eachDay(from: ISODate, to: ISODate): ISODate[] {
  if (isAfter(from, to)) return []
  const days: ISODate[] = []
  let current = parseISODate(from) && from
  while (!isAfter(current, to)) {
    days.push(current)
    current = addDays(current, 1)
  }
  return days
}

/**
 * A data de hoje no fuso informado.
 *
 * Único ponto do módulo que consulta o relógio. Recebe o fuso por parâmetro
 * para que os testes sejam determinísticos e para que o fuso do processo — que
 * na Vercel é UTC — nunca decida qual é "hoje" para o usuário.
 */
export function todayISO(timeZone: string = APP_TIMEZONE, now: Date = new Date()): ISODate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)

  const get = (type: 'year' | 'month' | 'day') =>
    parts.find((part) => part.type === type)?.value ?? ''

  return `${get('year')}-${get('month')}-${get('day')}`
}
