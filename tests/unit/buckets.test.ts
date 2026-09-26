import { describe, expect, it } from 'vitest'
import {
  bucketCountBetween,
  bucketize,
  defaultGranularity,
  scrollAnchorShiftPx,
} from '@/lib/finance/buckets'
import { firstNegativeDay } from '@/lib/finance/projection'
import type { DayProjection } from '@/lib/finance/types'

/**
 * O agregado existe para a janela longa caber na tela. O risco dele é apagar justamente o dia
 * que a tela existe para mostrar: aquele em que o saldo fica negativo. Estes testes afirmam que
 * o piso do período sobrevive ao agrupamento.
 */

const HOJE = '2026-09-26'

/** Série contígua a partir de `from`, com o saldo de cada dia informado na ordem. */
function serie(from: string, balances: readonly number[]): DayProjection[] {
  const [year, month, day] = from.split('-').map(Number) as [number, number, number]
  return balances.map((balanceCents, index) => {
    // Só para o fixture: soma dias em UTC, onde não há fuso para deslocar nada.
    const date = new Date(Date.UTC(year, month - 1, day + index))
    const iso = date.toISOString().slice(0, 10)
    return {
      date: iso,
      occurrences: [],
      inflowCents: index === 0 ? 0 : Math.max(balanceCents - (balances[index - 1] ?? 0), 0),
      outflowCents: index === 0 ? 0 : Math.max((balances[index - 1] ?? 0) - balanceCents, 0),
      balanceCents,
    }
  })
}

describe('bucketize', () => {
  it('o valor do ponto é o saldo de fechamento, nunca a média', () => {
    // Segunda 21/09 a domingo 27/09: sobe, mergulha, volta.
    const dias = serie('2026-09-21', [500_000, 300_000, -20_000, 100_000, 90_000, 80_000, 700_000])

    const [semana] = bucketize(dias, 'week', HOJE)

    expect(semana?.closingBalanceCents).toBe(700_000)
    // A média seria 250 mil, número que não existiu em dia nenhum.
    expect(semana?.minBalanceCents).toBe(-20_000)
    expect(semana?.maxBalanceCents).toBe(700_000)
  })

  it('semana começa na segunda', () => {
    // 20/09/2026 é domingo: pertence à semana que começou em 14/09.
    const dias = serie('2026-09-20', [10, 20, 30])
    const pontos = bucketize(dias, 'week', HOJE)

    expect(pontos.map((p) => p.key)).toEqual(['w:2026-09-14', 'w:2026-09-21'])
    expect(pontos[0]?.from).toBe('2026-09-20')
    expect(pontos[0]?.to).toBe('2026-09-20')
    expect(pontos[1]?.from).toBe('2026-09-21')
  })

  it('bucket de borda é marcado como parcial', () => {
    // Começa numa quarta e termina numa quinta: as duas semanas estão cortadas.
    const dias = serie('2026-09-23', [10, 20, 30, 40, 50, 60, 70, 80])
    const pontos = bucketize(dias, 'week', HOJE)

    expect(pontos.map((p) => p.isPartial)).toEqual([true, true])

    // Um mês inteiro no meio da janela não é parcial.
    const mes = bucketize(serie('2026-09-01', Array.from({ length: 30 }, (_, i) => i)), 'month', HOJE)
    expect(mes[0]?.isPartial).toBe(false)
  })

  it('guarda o piso do período e o primeiro dia negativo dentro dele', () => {
    const dias = serie('2026-09-21', [100, -50, -90, 40, 50, 60, 70])
    const [semana] = bucketize(dias, 'week', HOJE)

    expect(semana?.firstNegativeDate).toBe('2026-09-22')
    expect(semana?.minBalanceCents).toBe(-90)
  })

  it('um mergulho negativo no meio da semana não desaparece quando a semana fecha positiva', () => {
    const dias = serie('2026-09-21', [500, 400, -800, 200, 300, 400, 900])
    const [semana] = bucketize(dias, 'week', HOJE)

    // O fechamento é positivo, então só ele não denunciaria nada.
    expect(semana?.closingBalanceCents).toBeGreaterThan(0)
    expect(semana?.minBalanceCents).toBe(-800)
    expect(semana?.firstNegativeDate).toBe('2026-09-23')
  })

  it('o alerta de saldo negativo continua apontando o DIA, mesmo na escala mensal', () => {
    const dias = serie('2026-09-01', [
      ...Array.from({ length: 9 }, () => 1_000),
      -500, // 10/09
      ...Array.from({ length: 20 }, () => 2_000),
    ])

    // O alerta vem da série DIÁRIA, antes de agrupar. É a garantia mais barata do desenho.
    expect(firstNegativeDay(dias)?.date).toBe('2026-09-10')

    const [mes] = bucketize(dias, 'month', HOJE)
    expect(mes?.closingBalanceCents).toBe(2_000)
    expect(mes?.firstNegativeDate).toBe('2026-09-10')
  })

  it('a soma de entrada e saída dos buckets bate com a soma dos dias', () => {
    const dias = serie('2026-08-15', Array.from({ length: 60 }, (_, i) => 1_000 + i * 37 - (i % 7) * 500))

    for (const escala of ['day', 'week', 'month'] as const) {
      const pontos = bucketize(dias, escala, HOJE)
      expect(pontos.reduce((t, p) => t + p.inflowCents, 0)).toBe(
        dias.reduce((t, d) => t + d.inflowCents, 0),
      )
      expect(pontos.reduce((t, p) => t + p.outflowCents, 0)).toBe(
        dias.reduce((t, d) => t + d.outflowCents, 0),
      )
      expect(pontos.reduce((t, p) => t + p.dayCount, 0)).toBe(dias.length)
      // O último ponto sempre fecha no saldo do último dia.
      expect(pontos.at(-1)?.closingBalanceCents).toBe(dias.at(-1)?.balanceCents)
    }
  })

  it('marca o bucket que contém hoje e separa fato de previsão', () => {
    const dias = serie('2026-09-20', Array.from({ length: 14 }, () => 100))
    const pontos = bucketize(dias, 'week', HOJE)

    // HOJE é 26/09, sábado da semana de 21/09.
    expect(pontos.map((p) => p.containsToday)).toEqual([false, true, false])
    expect(pontos.map((p) => p.isHistory)).toEqual([true, false, false])
  })

  it('rótulo de semana mostra os dois meses quando a semana atravessa a virada', () => {
    const dias = serie('2026-09-28', Array.from({ length: 7 }, () => 100))
    const [semana] = bucketize(dias, 'week', HOJE)
    expect(semana?.label).toBe('28/09–04/10')

    const dentro = bucketize(serie('2026-09-21', Array.from({ length: 7 }, () => 1)), 'week', HOJE)
    expect(dentro[0]?.label).toBe('21–27/09')
  })

  it('série vazia devolve nenhum ponto', () => {
    expect(bucketize([], 'week', HOJE)).toEqual([])
  })
})

describe('bucketCountBetween', () => {
  it('conta dias, semanas e meses do intervalo fechado', () => {
    expect(bucketCountBetween('2026-09-01', '2026-09-01', 'day')).toBe(1)
    expect(bucketCountBetween('2026-09-01', '2026-09-30', 'day')).toBe(30)
    // 01/09 é terça (semana de 31/08) e 30/09 é quarta (semana de 28/09): cinco semanas.
    expect(bucketCountBetween('2026-09-01', '2026-09-30', 'week')).toBe(5)
    expect(bucketCountBetween('2026-09-15', '2026-12-02', 'month')).toBe(4)
    expect(bucketCountBetween('2026-09-30', '2026-09-01', 'day')).toBe(0)
  })
})

describe('scrollAnchorShiftPx', () => {
  it('conta buckets, não dias, ao ampliar a janela na escala semanal', () => {
    // Catorze dias novos à esquerda, a partir de uma segunda: duas semanas, não catorze pontos.
    expect(scrollAnchorShiftPx('2026-09-21', '2026-09-07', 'week', 36)).toBe(2 * 36)
    expect(scrollAnchorShiftPx('2026-09-21', '2026-09-07', 'day', 14)).toBe(14 * 14)
  })

  it('não compensa nada quando a janela não cresceu à esquerda', () => {
    expect(scrollAnchorShiftPx('2026-09-21', '2026-09-21', 'week', 36)).toBe(0)
    expect(scrollAnchorShiftPx('2026-09-21', '2026-09-28', 'week', 36)).toBe(0)
  })
})

describe('defaultGranularity', () => {
  it('escolhe a escala que cabe na extensão da janela', () => {
    expect(defaultGranularity('2026-09-01', '2026-10-01')).toBe('day')
    expect(defaultGranularity('2026-01-01', '2026-06-30')).toBe('week')
    expect(defaultGranularity('2025-01-01', '2026-12-31')).toBe('month')
  })
})
