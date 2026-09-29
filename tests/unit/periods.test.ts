import { describe, expect, it } from 'vitest'
import { MAX_WINDOW_DAYS } from '@/lib/finance/buckets'
import { addDays } from '@/lib/finance/date'
import {
  ANALYSIS_PERIODS,
  analysisPeriodRange,
  isAnalysisPeriod,
  matchAnalysisPeriod,
} from '@/lib/finance/periods'

/** Atalhos de período da Análise. v1.0 — 2026-09-27. */

const today = '2026-09-27'

describe('analysisPeriodRange', () => {
  it('dias contam a partir de hoje', () => {
    expect(analysisPeriodRange('last_30d', today)).toEqual({ from: '2026-08-28', to: today })
    expect(analysisPeriodRange('next_30d', today)).toEqual({ from: today, to: '2026-10-27' })
    expect(analysisPeriodRange('last_90d', today)).toEqual({ from: '2026-06-29', to: today })
    expect(analysisPeriodRange('next_90d', today)).toEqual({ from: today, to: '2026-12-26' })
  })

  it('mês passado e próximo mês são meses de calendário inteiros', () => {
    expect(analysisPeriodRange('last_month', today)).toEqual({ from: '2026-08-01', to: '2026-08-31' })
    expect(analysisPeriodRange('next_month', today)).toEqual({ from: '2026-10-01', to: '2026-10-31' })
  })

  it('3 e 6 meses contam o mês atual, de calendário', () => {
    expect(analysisPeriodRange('last_3m', today)).toEqual({ from: '2026-07-01', to: today })
    expect(analysisPeriodRange('next_3m', today)).toEqual({ from: today, to: '2026-11-30' })
    expect(analysisPeriodRange('last_6m', today)).toEqual({ from: '2026-04-01', to: today })
    expect(analysisPeriodRange('next_6m', today)).toEqual({ from: today, to: '2027-02-28' })
  })

  // v1.1 — 28/09/2026: os 12 meses da planilha (Fase 14).
  it('12 meses contam o mês atual, de calendário', () => {
    expect(analysisPeriodRange('last_12m', today)).toEqual({ from: '2025-10-01', to: today })
    expect(analysisPeriodRange('next_12m', today)).toEqual({ from: today, to: '2027-08-31' })
  })

  it('atravessa a virada do ano e o 31', () => {
    expect(analysisPeriodRange('last_month', '2026-01-31')).toEqual({
      from: '2025-12-01',
      to: '2025-12-31',
    })
    expect(analysisPeriodRange('next_month', '2026-01-31')).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    })
    expect(analysisPeriodRange('this_year', today)).toEqual({ from: '2026-01-01', to: '2026-12-31' })
  })

  it('todo atalho cabe no teto da janela', () => {
    for (const period of ANALYSIS_PERIODS) {
      const { from, to } = analysisPeriodRange(period, today)
      expect(from <= to).toBe(true)
      expect(to <= addDays(from, MAX_WINDOW_DAYS)).toBe(true)
    }
  })
})

describe('matchAnalysisPeriod', () => {
  it('reconhece o atalho pelo intervalo, e o resto é período específico', () => {
    expect(matchAnalysisPeriod('2026-08-01', '2026-08-31', today)).toBe('last_month')
    expect(matchAnalysisPeriod('2026-08-28', today, today)).toBe('last_30d')
    expect(matchAnalysisPeriod('2026-08-27', '2026-12-26', today)).toBeNull()
  })
})

describe('isAnalysisPeriod', () => {
  it('só aceita os atalhos conhecidos', () => {
    expect(isAnalysisPeriod('next_3m')).toBe(true)
    expect(isAnalysisPeriod('custom')).toBe(false)
    expect(isAnalysisPeriod('semana')).toBe(false)
    expect(isAnalysisPeriod(undefined)).toBe(false)
  })
})
