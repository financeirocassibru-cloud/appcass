import { describe, expect, it } from 'vitest'
import { expandGoal, monthlyContributionCents } from '@/lib/finance/goals'
import { sumCents } from '@/lib/finance/money'
import type { Goal } from '@/lib/finance/types'

/**
 * `lib/finance/goals.ts` ficou sem teste próprio desde a fase 2, e carregava um
 * erro que só apareceu quando as metas foram ligadas à projeção na 6a: o aporte
 * era recalculado a cada mês sem contar os aportes já projetados, e escalava.
 *
 * A invariante que faltava, e que estes testes fixam: **a soma dos aportes
 * projetados é exatamente o que falta para a meta.**
 */

const goal = (over: Partial<Goal> = {}): Goal => ({
  id: 'meta-1',
  name: 'Viagem',
  targetAmountCents: 600_000,
  targetDate: '2026-08-31',
  monthlyContributionCents: null,
  savedCents: 0,
  archivedAt: null,
  ...over,
})

describe('monthlyContributionCents', () => {
  it('usa o aporte informado quando existe', () => {
    expect(monthlyContributionCents(goal({ monthlyContributionCents: 70_000 }), '2026-03-01')).toBe(
      70_000,
    )
  })

  it('deriva do que falta e do prazo', () => {
    // 600.000 em 6 meses (março a agosto, com agosto contando).
    expect(monthlyContributionCents(goal(), '2026-03-01')).toBe(100_000)
  })

  it('considera o que já foi guardado', () => {
    expect(monthlyContributionCents(goal({ savedCents: 300_000 }), '2026-03-01')).toBe(50_000)
  })

  it('devolve zero para meta já cumprida', () => {
    expect(monthlyContributionCents(goal({ savedCents: 600_000 }), '2026-03-01')).toBe(0)
    expect(monthlyContributionCents(goal({ savedCents: 700_000 }), '2026-03-01')).toBe(0)
  })

  it('devolve zero sem prazo e sem aporte definido', () => {
    expect(monthlyContributionCents(goal({ targetDate: null }), '2026-03-01')).toBe(0)
  })
})

describe('expandGoal — a soma é exatamente o que falta', () => {
  it('rateio divisível: seis parcelas iguais', () => {
    const aportes = expandGoal(goal(), '2026-03-01', '2026-08-31')
    expect(aportes.map((a) => a.amountCents)).toEqual([
      100_000, 100_000, 100_000, 100_000, 100_000, 100_000,
    ])
    expect(sumCents(aportes.map((a) => a.amountCents))).toBe(600_000)
  })

  it('rateio indivisível: o resto vai para as primeiras, e a soma fecha', () => {
    const aportes = expandGoal(
      goal({ targetAmountCents: 100_001, targetDate: '2026-05-31' }),
      '2026-03-01',
      '2026-05-31',
    )
    expect(sumCents(aportes.map((a) => a.amountCents))).toBe(100_001)
  })

  it('a soma fecha em muitas combinações de valor e prazo', () => {
    // A regressão que isto barra: a versão anterior projetava R$ 14.700,00 para
    // guardar R$ 6.000,00.
    for (const total of [1, 7, 100, 999, 100_001, 600_000, 1_234_567]) {
      for (const [fim, esperadoMeses] of [
        ['2026-03-31', 1],
        ['2026-05-31', 3],
        ['2026-08-31', 6],
        ['2027-02-28', 12],
      ] as const) {
        const aportes = expandGoal(
          goal({ targetAmountCents: total, targetDate: fim }),
          '2026-03-01',
          fim,
        )
        expect(sumCents(aportes.map((a) => a.amountCents))).toBe(total)
        expect(aportes.length).toBeLessThanOrEqual(esperadoMeses)
      }
    }
  })

  it('desconta o que já foi guardado', () => {
    const aportes = expandGoal(goal({ savedCents: 240_000 }), '2026-03-01', '2026-08-31')
    expect(sumCents(aportes.map((a) => a.amountCents))).toBe(360_000)
  })
})

describe('expandGoal — aporte fixo', () => {
  it('repete o valor informado', () => {
    const aportes = expandGoal(
      goal({ monthlyContributionCents: 100_000 }),
      '2026-03-01',
      '2026-08-31',
    )
    expect(aportes.every((a) => a.amountCents === 100_000)).toBe(true)
  })

  it('para de aportar ao atingir a meta, e a última parcela é o que falta', () => {
    // 250.000 com aporte de 100.000: 100 + 100 + 50, e nada depois.
    const aportes = expandGoal(
      goal({ targetAmountCents: 250_000, monthlyContributionCents: 100_000 }),
      '2026-03-01',
      '2026-08-31',
    )
    expect(aportes.map((a) => a.amountCents)).toEqual([100_000, 100_000, 50_000])
    expect(sumCents(aportes.map((a) => a.amountCents))).toBe(250_000)
  })

  it('aporte fixo funciona sem prazo', () => {
    const aportes = expandGoal(
      goal({ targetDate: null, monthlyContributionCents: 50_000 }),
      '2026-03-01',
      '2026-06-30',
    )
    expect(aportes).toHaveLength(4)
  })
})

describe('expandGoal — limites', () => {
  it('o aporte cai no último dia do mês', () => {
    const aportes = expandGoal(goal(), '2026-03-01', '2026-04-30')
    expect(aportes.map((a) => a.date)).toEqual(['2026-03-31', '2026-04-30'])
  })

  it('fevereiro bissexto cai no dia 29', () => {
    const aportes = expandGoal(
      goal({ targetDate: '2024-02-29' }),
      '2024-02-01',
      '2024-02-29',
    )
    expect(aportes[0]?.date).toBe('2024-02-29')
  })

  it('não projeta depois do prazo', () => {
    const aportes = expandGoal(goal(), '2026-03-01', '2026-12-31')
    expect(aportes.at(-1)?.date).toBe('2026-08-31')
  })

  it('uma janela curta vê só o aporte do mês, não a meta inteira', () => {
    // Quem olha 30 dias de uma meta que termina em agosto tem de ver o aporte
    // de março, e não os 600.000 espremidos num mês.
    const aportes = expandGoal(goal(), '2026-03-01', '2026-03-31')
    expect(aportes).toHaveLength(1)
    expect(aportes[0]?.amountCents).toBe(100_000)
  })

  it('meta arquivada, cumprida ou com janela invertida não projeta nada', () => {
    expect(expandGoal(goal({ archivedAt: '2026-01-01T00:00:00Z' }), '2026-03-01', '2026-08-31')).toEqual([])
    expect(expandGoal(goal({ savedCents: 600_000 }), '2026-03-01', '2026-08-31')).toEqual([])
    expect(expandGoal(goal(), '2026-08-31', '2026-03-01')).toEqual([])
  })

  it('a chave da ocorrência é estável e identifica o mês', () => {
    const aportes = expandGoal(goal(), '2026-03-01', '2026-04-30')
    expect(aportes.map((a) => a.key)).toEqual(['goal:meta-1:2026-03', 'goal:meta-1:2026-04'])
  })
})
