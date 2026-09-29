import { addDays, addMonths, endOfMonth, parseISODate, startOfMonth, toISODate, type ISODate } from './date'

/**
 * Os atalhos de período da Análise. v1.1 — 28/09/2026 (v1.0 — 2026-09-27).
 *
 * v1.1 — 28/09/2026: "Últimos 12 meses" e "Próximos 12 meses" (Fase 14), que a planilha usa como
 * padrão e a Análise também oferece. O banco aceita os dois pela migration 0023.
 *
 * Eram quatro botões ("30 dias atrás", "Agora", "6 meses à frente", "1 ano") numa fileira que
 * rolava para o lado. Viraram as opções de um menu, cujo padrão é "Período específico" (as
 * duas datas): o visual fica limpo, e cabem mais atalhos sem poluir.
 *
 * Os valores são o que o banco guarda em `profiles.analysis_period` (migration 0018, com a
 * lista conferida por `check`), em inglês como pede o invariante 10; o rótulo é a interface.
 * Guardar o **atalho**, e não as datas, é o que faz "Próximos 30 dias" andar com o
 * calendário: aberto amanhã, ele começa amanhã.
 *
 * Duas famílias, e a diferença é de propósito:
 * - **dias** (30, 90): contados a partir de hoje, dia a dia;
 * - **meses** (3, 6): meses de calendário inteiros, contando o atual — "Últimos 3 meses" em
 *   27/09 vai de 01/07 a hoje; "Próximos 3 meses" vai de hoje a 30/11.
 *
 * Puro (invariante 9): hoje entra por parâmetro, e toda conta é de calendário, sem `Date`.
 */

export const ANALYSIS_PERIODS = [
  'last_30d',
  'next_30d',
  'last_month',
  'next_month',
  'last_90d',
  'next_90d',
  'last_3m',
  'next_3m',
  'last_6m',
  'next_6m',
  // v1.1 — 28/09/2026: os 12 meses, pedidos junto com a planilha (Fase 14) — valem aqui e lá.
  'last_12m',
  'next_12m',
  'this_year',
] as const

export type AnalysisPeriod = (typeof ANALYSIS_PERIODS)[number]

/** O que o perfil guarda: um atalho, ou `custom` com as duas datas. */
export type SavedAnalysisPeriod = AnalysisPeriod | 'custom'

export const ANALYSIS_PERIOD_LABELS: Record<AnalysisPeriod, string> = {
  last_30d: 'Últimos 30 dias',
  next_30d: 'Próximos 30 dias',
  last_month: 'Mês passado',
  next_month: 'Próximo mês',
  last_90d: 'Últimos 90 dias',
  next_90d: 'Próximos 90 dias',
  last_3m: 'Últimos 3 meses',
  next_3m: 'Próximos 3 meses',
  last_6m: 'Últimos 6 meses',
  next_6m: 'Próximos 6 meses',
  last_12m: 'Últimos 12 meses',
  next_12m: 'Próximos 12 meses',
  this_year: 'Este ano',
}

export function isAnalysisPeriod(value: unknown): value is AnalysisPeriod {
  return typeof value === 'string' && (ANALYSIS_PERIODS as readonly string[]).includes(value)
}

export interface PeriodRange {
  from: ISODate
  to: ISODate
}

/** O intervalo de um atalho, a partir de hoje. */
export function analysisPeriodRange(period: AnalysisPeriod, today: ISODate): PeriodRange {
  switch (period) {
    case 'last_30d':
      return { from: addDays(today, -30), to: today }
    case 'next_30d':
      return { from: today, to: addDays(today, 30) }
    case 'last_month': {
      const month = addMonths(startOfMonth(today), -1)
      return { from: month, to: endOfMonth(month) }
    }
    case 'next_month': {
      const month = addMonths(startOfMonth(today), 1)
      return { from: month, to: endOfMonth(month) }
    }
    case 'last_90d':
      return { from: addDays(today, -90), to: today }
    case 'next_90d':
      return { from: today, to: addDays(today, 90) }
    case 'last_3m':
      return { from: addMonths(startOfMonth(today), -2), to: today }
    case 'next_3m':
      return { from: today, to: endOfMonth(addMonths(startOfMonth(today), 2)) }
    case 'last_6m':
      return { from: addMonths(startOfMonth(today), -5), to: today }
    case 'next_6m':
      return { from: today, to: endOfMonth(addMonths(startOfMonth(today), 5)) }
    // v1.1 — 28/09/2026: a mesma família dos 3 e 6 meses — o mês atual conta.
    case 'last_12m':
      return { from: addMonths(startOfMonth(today), -11), to: today }
    case 'next_12m':
      return { from: today, to: endOfMonth(addMonths(startOfMonth(today), 11)) }
    case 'this_year': {
      const { year } = parseISODate(today)
      return { from: toISODate({ year, month: 1, day: 1 }), to: toISODate({ year, month: 12, day: 31 }) }
    }
  }
}

/** O atalho cujo intervalo, hoje, é exatamente este — ou `null` (período específico). */
export function matchAnalysisPeriod(from: ISODate, to: ISODate, today: ISODate): AnalysisPeriod | null {
  for (const period of ANALYSIS_PERIODS) {
    const range = analysisPeriodRange(period, today)
    if (range.from === from && range.to === to) return period
  }
  return null
}
