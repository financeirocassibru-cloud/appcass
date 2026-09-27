import { describe, expect, it } from 'vitest'
import { isoWeekday } from '@/lib/finance/date'
import {
  alignWeekdayToMonth,
  habitSourceMonths,
  duplicateHabits,
  habitTargetMonths,
  habitWindowStart,
  summarizeHabits,
} from '@/lib/finance/habits'
import type { Entry } from '@/lib/finance/types'

/**
 * "Duplicar hábitos" (v1.0 — 2026-09-27).
 *
 * O contrato que a pessoa vê: o gasto do 2º sábado de agosto cai no 2º sábado de setembro, só
 * lançamento avulso é hábito, e nada é datado antes de hoje nem depois do fim do cenário.
 */

type Habit = Pick<Entry, 'kind' | 'description' | 'amountCents' | 'occurredOn' | 'categoryId' | 'source'>

function habit(overrides: Partial<Habit>): Habit {
  return {
    kind: 'expense',
    description: 'Cinema',
    amountCents: 5000,
    occurredOn: '2026-08-08',
    categoryId: null,
    source: 'manual',
    ...overrides,
  }
}

describe('alignWeekdayToMonth', () => {
  it('mantém o dia da semana e a posição no mês', () => {
    // 08/08/2026 é o 2º sábado de agosto; o 2º sábado de setembro é 12/09.
    expect(isoWeekday('2026-08-08')).toBe(6)
    expect(alignWeekdayToMonth('2026-08-08', '2026-09')).toBe('2026-09-12')
    expect(isoWeekday('2026-09-12')).toBe(6)
  })

  it('o 5º que não existe cai no último daquele dia', () => {
    // 29/08/2026 é o 5º sábado de agosto; setembro de 2026 só tem 4 sábados (5, 12, 19, 26).
    expect(isoWeekday('2026-08-29')).toBe(6)
    expect(alignWeekdayToMonth('2026-08-29', '2026-09')).toBe('2026-09-26')
  })

  it('funciona na virada do ano e em fevereiro', () => {
    // 31/12/2026 é quinta, a 5ª de dezembro; fevereiro de 2027 tem 4 quintas → 25/02.
    expect(isoWeekday('2026-12-31')).toBe(4)
    expect(alignWeekdayToMonth('2026-12-31', '2027-02')).toBe('2027-02-25')
    expect(alignWeekdayToMonth('2026-12-01', '2027-01')).toBe('2027-01-05')
  })

  it('devolve sempre o mesmo dia da semana', () => {
    for (let day = 1; day <= 31; day += 1) {
      const source = `2026-08-${String(day).padStart(2, '0')}`
      for (const month of ['2026-09', '2026-10', '2027-02']) {
        const target = alignWeekdayToMonth(source, month)
        expect(target.slice(0, 7)).toBe(month)
        expect(isoWeekday(target)).toBe(isoWeekday(source))
      }
    }
  })
})

describe('habitTargetMonths', () => {
  it('são os meses depois do de origem, até o fim do cenário', () => {
    expect(
      habitTargetMonths({ sourceMonth: '2026-08', from: '2026-09-27', to: '2026-12-31' }),
    ).toEqual(['2026-09', '2026-10', '2026-11', '2026-12'])
  })

  it('nunca repete o próprio mês de origem', () => {
    expect(
      habitTargetMonths({ sourceMonth: '2026-08', from: '2026-08-01', to: '2026-09-30' }),
    ).toEqual(['2026-09'])
  })

  it('com intervalo, só os meses dele', () => {
    expect(
      habitTargetMonths({
        sourceMonth: '2026-08',
        from: '2026-09-27',
        to: '2027-03-31',
        range: { from: '2026-11', to: '2027-01' },
      }),
    ).toEqual(['2026-11', '2026-12', '2027-01'])
  })
})

describe('duplicateHabits', () => {
  const from = habitWindowStart('2026-09-01', '2026-09-10')
  const months = habitTargetMonths({ sourceMonth: '2026-08', from, to: '2026-11-30' })

  it('só lançamento avulso vira hábito', () => {
    const copies = duplicateHabits({
      entries: [
        habit({ description: 'Cinema' }),
        habit({ description: 'Aluguel', source: 'recurring' }),
        habit({ description: 'TV (3/10)', source: 'installment' }),
        habit({ description: 'Aporte', source: 'goal' }),
      ],
      sourceMonth: '2026-08',
      targetMonths: months,
      kinds: 'all',
      from,
      to: '2026-11-30',
    })
    expect(new Set(copies.map((copy) => copy.description))).toEqual(new Set(['Cinema']))
  })

  it('ignora lançamentos de outros meses', () => {
    const copies = duplicateHabits({
      entries: [habit({ occurredOn: '2026-07-11' })],
      sourceMonth: '2026-08',
      targetMonths: months,
      kinds: 'all',
      from,
      to: '2026-11-30',
    })
    expect(copies).toEqual([])
  })

  it('filtra por tipo', () => {
    const entries = [habit({ kind: 'expense' }), habit({ kind: 'income', description: 'Freela' })]
    const args = { entries, sourceMonth: '2026-08', targetMonths: months, from, to: '2026-11-30' }
    expect(duplicateHabits({ ...args, kinds: 'expense' }).every((c) => c.kind === 'expense')).toBe(true)
    expect(duplicateHabits({ ...args, kinds: 'income' }).every((c) => c.kind === 'income')).toBe(true)
    expect(duplicateHabits({ ...args, kinds: 'all' })).toHaveLength(6)
  })

  it('não data nada antes de hoje nem depois do fim do cenário', () => {
    // O 1º sábado de setembro (05/09) já passou em 10/09; o de novembro (07/11) cabe; o 5º
    // sábado de agosto vira 28/11, que também cabe, mas o fim em 20/11 o corta.
    const copies = duplicateHabits({
      entries: [habit({ occurredOn: '2026-08-01' }), habit({ occurredOn: '2026-08-29' })],
      sourceMonth: '2026-08',
      targetMonths: months,
      kinds: 'all',
      from,
      to: '2026-11-20',
    })
    const dates = copies.map((copy) => copy.occursOn)
    expect(dates).not.toContain('2026-09-05')
    expect(dates.every((date) => date >= '2026-09-10' && date <= '2026-11-20')).toBe(true)
    expect(dates).toEqual(['2026-09-26', '2026-10-03', '2026-10-31', '2026-11-07'])
  })

  it('preserva valor e categoria, e cada mês soma o mesmo que a origem', () => {
    const entries = [
      habit({ amountCents: 1234, categoryId: 'cat-lazer' }),
      habit({ amountCents: 999, occurredOn: '2026-08-15', categoryId: null }),
    ]
    const copies = duplicateHabits({
      entries,
      sourceMonth: '2026-08',
      targetMonths: ['2026-10', '2026-11'],
      kinds: 'all',
      from: '2026-10-01',
      to: '2026-11-30',
    })
    for (const month of ['2026-10', '2026-11']) {
      const inMonth = copies.filter((copy) => copy.occursOn.startsWith(month))
      expect(inMonth.reduce((sum, copy) => sum + copy.amountCents, 0)).toBe(2233)
    }
    expect(copies.find((copy) => copy.amountCents === 1234)?.categoryId).toBe('cat-lazer')
  })

  it('resume por tipo', () => {
    const summary = summarizeHabits([
      { kind: 'expense', description: 'a', amountCents: 100, occursOn: '2026-10-01', categoryId: null },
      { kind: 'expense', description: 'b', amountCents: 50, occursOn: '2026-10-02', categoryId: null },
      { kind: 'income', description: 'c', amountCents: 70, occursOn: '2026-10-03', categoryId: null },
    ])
    expect(summary).toEqual({ expense: { count: 2, cents: 150 }, income: { count: 1, cents: 70 } })
  })
})

// v1.1 — 2026-09-27: o mês em aberto também pode ser a origem.
describe('habitSourceMonths', () => {
  it('começa no mês atual, em aberto, e volta atravessando o ano', () => {
    expect(habitSourceMonths('2026-02-10', 3)).toEqual(['2026-02', '2026-01', '2025-12'])
  })

  it('repetir o mês em aberto começa no mês seguinte, sem dobrar o atual', () => {
    expect(
      habitTargetMonths({ sourceMonth: '2026-09', from: '2026-09-27', to: '2026-12-31' }),
    ).toEqual(['2026-10', '2026-11', '2026-12'])
  })
})
