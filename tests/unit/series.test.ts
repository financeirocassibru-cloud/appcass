import { describe, expect, it } from 'vitest'
import {
  buildMonthlySeries,
  formatMonthLabel,
  formatMonthLong,
  lastMonthKeys,
  monthKeyOf,
  niceTicks,
  topCategories,
  type MonthlyTotals,
} from '@/lib/finance/series'

const total = (month: string, incomeCents: number, expenseCents: number): MonthlyTotals => ({
  month,
  incomeCents,
  expenseCents,
  netCents: incomeCents - expenseCents,
})

describe('lastMonthKeys', () => {
  it('devolve os meses do mais antigo para o mais recente', () => {
    expect(lastMonthKeys('2026-03', 4)).toEqual(['2025-12', '2026-01', '2026-02', '2026-03'])
  })

  it('atravessa a virada de ano', () => {
    expect(lastMonthKeys('2026-01', 3)).toEqual(['2025-11', '2025-12', '2026-01'])
  })

  it('um mês só devolve ele mesmo', () => {
    expect(lastMonthKeys('2026-03', 1)).toEqual(['2026-03'])
  })

  it('recusa mês fora do formato e contagem inválida', () => {
    expect(() => lastMonthKeys('2026-3', 6)).toThrow()
    expect(() => lastMonthKeys('março', 6)).toThrow()
    expect(() => lastMonthKeys('2026-03', 0)).toThrow()
    expect(() => lastMonthKeys('2026-03', 1.5)).toThrow()
  })
})

describe('buildMonthlySeries', () => {
  it('mês sem lançamento aparece como zero, no lugar certo', () => {
    // A regressão que este teste barra: um `group by` não produz linha para mês
    // vazio, então fevereiro sumiria e janeiro ficaria colado em março, como se
    // fossem consecutivos.
    const serie = buildMonthlySeries(
      [total('2026-01', 500_000, 300_000), total('2026-03', 400_000, 250_000)],
      '2026-03',
      3,
    )

    expect(serie.map((m) => m.month)).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(serie[1]).toEqual({
      month: '2026-02',
      incomeCents: 0,
      expenseCents: 0,
      netCents: 0,
    })
  })

  it('série toda vazia tem o tamanho pedido', () => {
    const serie = buildMonthlySeries([], '2026-03', 6)
    expect(serie).toHaveLength(6)
    expect(serie.every((m) => m.incomeCents === 0 && m.expenseCents === 0)).toBe(true)
  })

  it('descarta mês fora do intervalo pedido', () => {
    const serie = buildMonthlySeries(
      [total('2025-01', 900_000, 0), total('2026-03', 100_000, 0)],
      '2026-03',
      2,
    )
    expect(serie.map((m) => m.month)).toEqual(['2026-02', '2026-03'])
    expect(serie.reduce((sum, m) => sum + m.incomeCents, 0)).toBe(100_000)
  })

  it('preserva os valores do mês que existe', () => {
    const serie = buildMonthlySeries([total('2026-03', 123_456, 65_432)], '2026-03', 1)
    expect(serie[0]).toEqual(total('2026-03', 123_456, 65_432))
  })
})

describe('formatMonthLabel', () => {
  it('usa o nome curto do mês', () => {
    expect(formatMonthLabel('2026-03')).toBe('mar')
    expect(formatMonthLabel('2026-09')).toBe('set')
  })

  it('acrescenta o ano quando difere do mês de referência', () => {
    expect(formatMonthLabel('2025-12', '2026-03')).toBe('dez/25')
    expect(formatMonthLabel('2026-01', '2026-03')).toBe('jan')
  })

  it('não desloca o mês, em nenhum fuso', () => {
    // Montado em UTC e formatado em UTC: janeiro nunca vira dezembro.
    expect(formatMonthLabel('2026-01')).toBe('jan')
    expect(formatMonthLabel('2026-12')).toBe('dez')
  })
})

describe('formatMonthLong', () => {
  it('escreve o mês e o ano', () => {
    expect(formatMonthLong('2026-03')).toBe('março de 2026')
    expect(formatMonthLong('2026-01')).toBe('janeiro de 2026')
  })
})

describe('monthKeyOf', () => {
  it('extrai o mês de uma data ISO', () => {
    expect(monthKeyOf('2026-03-05')).toBe('2026-03')
  })

  it('recusa data inválida', () => {
    expect(() => monthKeyOf('2026-02-30')).toThrow()
  })
})

describe('topCategories', () => {
  const fatia = (name: string, totalCents: number) => ({
    categoryId: name,
    name,
    color: '#000000',
    totalCents,
  })

  it('ordena da maior para a menor', () => {
    const fatias = topCategories([fatia('a', 100), fatia('b', 300), fatia('c', 200)], 6)
    expect(fatias.map((f) => f.name)).toEqual(['b', 'c', 'a'])
  })

  it('agrupa a cauda em Outros sem perder centavo', () => {
    const entrada = [
      fatia('a', 1000),
      fatia('b', 900),
      fatia('c', 11),
      fatia('d', 13),
      fatia('e', 17),
    ]
    const fatias = topCategories(entrada, 3)

    expect(fatias.map((f) => f.name)).toEqual(['a', 'b', 'Outros'])
    expect(fatias[2]?.totalCents).toBe(41)
    // O total tem de continuar fechando: é o que uma rosca ou um ranking mentem
    // quando a cauda simplesmente desaparece.
    const somaEntrada = entrada.reduce((s, f) => s + f.totalCents, 0)
    const somaSaida = fatias.reduce((s, f) => s + f.totalCents, 0)
    expect(somaSaida).toBe(somaEntrada)
  })

  it('não cria Outros quando cabe tudo', () => {
    const fatias = topCategories([fatia('a', 10), fatia('b', 20)], 6)
    expect(fatias.map((f) => f.name)).toEqual(['b', 'a'])
  })

  it('descarta fatia zerada', () => {
    const fatias = topCategories([fatia('a', 0), fatia('b', 20)], 6)
    expect(fatias.map((f) => f.name)).toEqual(['b'])
  })

  it('lista vazia devolve lista vazia', () => {
    expect(topCategories([], 6)).toEqual([])
  })

  it('recusa limite inválido', () => {
    expect(() => topCategories([fatia('a', 10)], 0)).toThrow()
  })
})

describe('niceTicks', () => {
  it('produz marcas em números redondos', () => {
    // R$ 12.345,67 de maior barra vira 0 / 5 mil / 10 mil / 15 mil, e não
    // 0 / 3,5 mil / 7 mil / 10,5 mil / 14 mil.
    expect(niceTicks(1_234_567)).toEqual([0, 500_000, 1_000_000, 1_500_000])
    expect(niceTicks(780_000)).toEqual([0, 200_000, 400_000, 600_000, 800_000])
  })

  it('a última marca fica acima do maior valor', () => {
    const ticks = niceTicks(1_234_567)
    expect(ticks[ticks.length - 1]).toBeGreaterThan(1_234_567)
  })

  it('começa sempre em zero, para a barra crescer de uma base única', () => {
    expect(niceTicks(50_000)[0]).toBe(0)
    expect(niceTicks(7)[0]).toBe(0)
  })

  it('devolve só o zero quando não há valor', () => {
    expect(niceTicks(0)).toEqual([0])
    expect(niceTicks(-100)).toEqual([0])
  })

  it('as marcas são centavos inteiros, sem resíduo de ponto flutuante', () => {
    for (const max of [1_234_567, 999, 333_333, 7_000_001]) {
      expect(niceTicks(max).every(Number.isInteger)).toBe(true)
    }
  })

  it('recusa contagem inválida', () => {
    expect(() => niceTicks(1000, 0)).toThrow()
  })
})
