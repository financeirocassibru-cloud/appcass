import { describe, expect, it } from 'vitest'
import { DateError } from '@/lib/finance/date'
import { formatDayLabel, groupByDay } from '@/lib/finance/grouping'

interface Item {
  id: string
  date: string
}

const getDate = (item: Item) => item.date

describe('groupByDay', () => {
  it('agrupa por dia, mais recente primeiro', () => {
    const grupos = groupByDay(
      [
        { id: 'a', date: '2026-03-01' },
        { id: 'b', date: '2026-02-28' },
        { id: 'c', date: '2026-03-01' },
      ],
      getDate,
    )

    expect(grupos.map((g) => g.date)).toEqual(['2026-03-01', '2026-02-28'])
    expect(grupos[0]?.items.map((i) => i.id)).toEqual(['a', 'c'])
    expect(grupos[1]?.items.map((i) => i.id)).toEqual(['b'])
  })

  it('não desloca o dia na virada de mês', () => {
    // A regressão do app antigo: agrupar via `Date` em UTC−3 jogava o dia 1º
    // para 28/02. Aqui o agrupamento é sobre a string, sem fuso envolvido.
    const grupos = groupByDay([{ id: 'a', date: '2026-03-01' }], getDate)
    expect(grupos).toHaveLength(1)
    expect(grupos[0]?.date).toBe('2026-03-01')
  })

  it('preserva a ordem de chegada dentro do dia', () => {
    const grupos = groupByDay(
      [
        { id: '1', date: '2026-03-05' },
        { id: '2', date: '2026-03-05' },
        { id: '3', date: '2026-03-05' },
      ],
      getDate,
    )
    expect(grupos[0]?.items.map((i) => i.id)).toEqual(['1', '2', '3'])
  })

  it('ordena crescente quando pedido', () => {
    const grupos = groupByDay(
      [
        { id: 'a', date: '2026-03-10' },
        { id: 'b', date: '2026-03-01' },
      ],
      getDate,
      'asc',
    )
    expect(grupos.map((g) => g.date)).toEqual(['2026-03-01', '2026-03-10'])
  })

  it('devolve vazio para lista vazia', () => {
    expect(groupByDay([], getDate)).toEqual([])
  })

  it('recusa data fora do formato em vez de criar um dia fantasma', () => {
    expect(() => groupByDay([{ id: 'a', date: '05/03/2026' }], getDate)).toThrow(DateError)
    expect(() => groupByDay([{ id: 'a', date: '2026-02-30' }], getDate)).toThrow(DateError)
  })
})

describe('formatDayLabel', () => {
  const hoje = '2026-03-05'

  it('nomeia hoje, ontem e amanhã', () => {
    expect(formatDayLabel('2026-03-05', hoje)).toBe('Hoje')
    expect(formatDayLabel('2026-03-04', hoje)).toBe('Ontem')
    expect(formatDayLabel('2026-03-06', hoje)).toBe('Amanhã')
  })

  it('usa dia da semana e mês nos outros dias', () => {
    // 01/03/2026 é um domingo.
    expect(formatDayLabel('2026-03-01', hoje)).toBe('dom, 01 de março')
  })

  it('atravessa a virada de mês sem deslocar o dia', () => {
    expect(formatDayLabel('2026-03-01', '2026-03-02')).toBe('Ontem')
    expect(formatDayLabel('2026-02-28', '2026-03-01')).toBe('Ontem')
  })

  it('atravessa a virada de ano', () => {
    expect(formatDayLabel('2025-12-31', '2026-01-01')).toBe('Ontem')
  })

  it('trata fevereiro bissexto', () => {
    expect(formatDayLabel('2024-02-29', '2024-03-01')).toBe('Ontem')
  })
})
