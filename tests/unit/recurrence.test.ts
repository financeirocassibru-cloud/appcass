import { describe, expect, it } from 'vitest'
import { expandRecurringRule } from '@/lib/finance/recurrence'
import type { RecurringRule } from '@/lib/finance/types'

function rule(overrides: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: 'rule-1',
    kind: 'expense',
    description: 'Aluguel',
    amountCents: 150_000,
    categoryId: null,
    frequency: 'monthly',
    dayOfMonth: 10,
    startsOn: '2026-01-01',
    endsOn: null,
    isActive: true,
    ...overrides,
  }
}

describe('expandRecurringRule — mensal', () => {
  it('gera uma ocorrência por mês no intervalo', () => {
    const result = expandRecurringRule(rule(), '2026-01-01', '2026-03-31')
    expect(result.map((o) => o.date)).toEqual(['2026-01-10', '2026-02-10', '2026-03-10'])
  })

  it('ajusta o dia 31 a cada mês, sem pular ocorrência', () => {
    const result = expandRecurringRule(
      rule({ dayOfMonth: 31 }),
      '2026-01-01',
      '2026-04-30',
    )
    expect(result.map((o) => o.date)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ])
  })

  it('usa YYYY-MM como chave de ocorrência', () => {
    const result = expandRecurringRule(rule(), '2026-01-01', '2026-02-28')
    expect(result.map((o) => o.key)).toEqual(['recurring:rule-1:2026-01', 'recurring:rule-1:2026-02'])
  })

  it('para em endsOn no meio do intervalo', () => {
    const result = expandRecurringRule(
      rule({ endsOn: '2026-02-15' }),
      '2026-01-01',
      '2026-05-31',
    )
    expect(result.map((o) => o.date)).toEqual(['2026-01-10', '2026-02-10'])
  })

  it('não gera nada antes de startsOn', () => {
    const result = expandRecurringRule(
      rule({ startsOn: '2026-03-01' }),
      '2026-01-01',
      '2026-04-30',
    )
    expect(result.map((o) => o.date)).toEqual(['2026-03-10', '2026-04-10'])
  })

  it('ignora regra inativa', () => {
    expect(expandRecurringRule(rule({ isActive: false }), '2026-01-01', '2026-12-31')).toEqual([])
  })

  it('devolve vazio quando endsOn é anterior ao intervalo', () => {
    expect(expandRecurringRule(rule({ endsOn: '2025-12-31' }), '2026-01-01', '2026-03-31')).toEqual([])
  })

  it('devolve vazio quando o intervalo é invertido', () => {
    expect(expandRecurringRule(rule(), '2026-03-31', '2026-01-01')).toEqual([])
  })

  it('cai no dia da data de início quando não há dia de vencimento', () => {
    const result = expandRecurringRule(
      rule({ dayOfMonth: null, startsOn: '2026-01-07' }),
      '2026-01-01',
      '2026-02-28',
    )
    expect(result.map((o) => o.date)).toEqual(['2026-01-07', '2026-02-07'])
  })

  it('preserva tipo e valor da regra', () => {
    const [first] = expandRecurringRule(
      rule({ kind: 'income', amountCents: 500_000, description: 'Salário' }),
      '2026-01-01',
      '2026-01-31',
    )
    expect(first).toMatchObject({
      kind: 'income',
      amountCents: 500_000,
      description: 'Salário',
      origin: 'recurring',
      isRealized: false,
    })
  })
})

describe('expandRecurringRule — semanal e anual', () => {
  it('gera a cada 7 dias a partir do início', () => {
    const result = expandRecurringRule(
      rule({ frequency: 'weekly', startsOn: '2026-01-05' }),
      '2026-01-01',
      '2026-02-02',
    )
    expect(result.map((o) => o.date)).toEqual([
      '2026-01-05',
      '2026-01-12',
      '2026-01-19',
      '2026-01-26',
      '2026-02-02',
    ])
  })

  it('gera uma vez por ano', () => {
    const result = expandRecurringRule(
      rule({ frequency: 'yearly', startsOn: '2026-03-15' }),
      '2026-01-01',
      '2028-12-31',
    )
    expect(result.map((o) => o.date)).toEqual(['2026-03-15', '2027-03-15', '2028-03-15'])
  })

  it('usa a data como chave quando não é mensal', () => {
    const [first] = expandRecurringRule(
      rule({ frequency: 'weekly', startsOn: '2026-01-05' }),
      '2026-01-01',
      '2026-01-10',
    )
    expect(first?.key).toBe('recurring:rule-1:2026-01-05')
  })
})
