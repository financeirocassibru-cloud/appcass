import { describe, expect, it } from 'vitest'
import {
  buildCommitment,
  buildMonthlySeries,
  categoryDeviation,
  formatMonthLabel,
  formatMonthLong,
  lastMonthKeys,
  monthKeyOf,
  niceTicks,
  niceTicksRange,
  tickOffsets,
  topCategories,
  type MonthlyTotals,
  type SourceTotal,
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

describe('niceTicksRange', () => {
  it('cobre um intervalo que atravessa o zero, com o zero numa marca', () => {
    const ticks = niceTicksRange(-120_000, 340_000)
    expect(ticks).toContain(0)
    expect(ticks[0]).toBeLessThanOrEqual(-120_000)
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(340_000)
  })

  it('usa passos redondos', () => {
    expect(niceTicksRange(-50_000, 150_000)).toEqual([-50_000, 0, 50_000, 100_000, 150_000])
  })

  it('inclui o zero mesmo quando a série é toda positiva', () => {
    // O saldo começa no zero do eixo: uma área que flutua no meio do gráfico
    // exagera a variação e mente sobre a proporção.
    const ticks = niceTicksRange(80_000, 200_000)
    expect(ticks[0]).toBe(0)
  })

  it('inclui o zero quando a série é toda negativa', () => {
    const ticks = niceTicksRange(-200_000, -80_000)
    expect(ticks[ticks.length - 1]).toBe(0)
  })

  it('as marcas são centavos inteiros, sem resíduo de ponto flutuante', () => {
    for (const [min, max] of [
      [-1, 1],
      [-333_333, 777_777],
      [-7, 9_999_999],
    ] as const) {
      expect(niceTicksRange(min, max).every(Number.isInteger)).toBe(true)
    }
  })

  it('série constante em zero devolve só o zero', () => {
    expect(niceTicksRange(0, 0)).toEqual([0])
  })

  it('recusa contagem inválida', () => {
    expect(() => niceTicksRange(0, 100, 0)).toThrow()
  })
})

/**
 * v1.1 — 2026-09-26: o eixo Y da Análise é desenhado em DOM para poder ficar fixo enquanto o
 * gráfico rola, então a posição de cada marca passou a ser uma conta deste módulo.
 */
describe('tickOffsets', () => {
  it('a marca do zero cai na posição do zero do domínio', () => {
    // Domínio de −100 a 300 em 200px de área útil: o zero fica a um quarto do topo.
    const offsets = tickOffsets([-100, 0, 100, 200, 300], 220, 10, 10)
    const zero = offsets.find((offset) => offset.value === 0)
    expect(zero?.topPx).toBe(10 + 0.75 * 200)
  })

  it('a primeira marca fica no rodapé e a última no topo da área de plotagem', () => {
    const offsets = tickOffsets([0, 500, 1_000], 220, 8, 12)
    expect(offsets.at(0)?.topPx).toBe(8 + 200)
    expect(offsets.at(-1)?.topPx).toBe(8)
  })

  it('domínio degenerado não divide por zero', () => {
    const offsets = tickOffsets([0], 220, 10, 10)
    expect(offsets).toEqual([{ value: 0, topPx: 110 }])
    expect(tickOffsets([], 220, 10, 10)).toEqual([])
  })
})

describe('categoryDeviation', () => {
  const fatia = (name: string, totalCents: number, categoryId = name.toLowerCase()) => ({
    categoryId,
    name,
    color: '#7c3aed',
    totalCents,
  })

  it('normaliza os dois lados para média mensal antes de comparar', () => {
    // Três meses de período contra doze de base: sem normalizar, tudo acusaria queda.
    const rows = categoryDeviation(
      [fatia('Mercado', 300_000)],
      [fatia('Mercado', 1_200_000)],
      { currentMonths: 3, baselineMonths: 12 },
    )

    expect(rows[0]?.currentCents).toBe(100_000)
    expect(rows[0]?.baselineCents).toBe(100_000)
    expect(rows[0]?.deltaCents).toBe(0)
    expect(rows[0]?.deltaRatio).toBe(0)
  })

  it('calcula a variação relativa contra a média', () => {
    const rows = categoryDeviation(
      [fatia('Mercado', 138_000)],
      [fatia('Mercado', 100_000)],
      { currentMonths: 1, baselineMonths: 1 },
    )

    expect(rows[0]?.deltaCents).toBe(38_000)
    expect(rows[0]?.deltaRatio).toBeCloseTo(0.38)
    expect(rows[0]?.isNew).toBe(false)
  })

  it('categoria sem histórico é "nova", e não uma variação infinita', () => {
    const rows = categoryDeviation([fatia('Academia', 12_000)], [], {
      currentMonths: 1,
      baselineMonths: 6,
    })

    expect(rows[0]?.isNew).toBe(true)
    // Dividir por zero daria Infinity, que a tela mostraria como "+Infinity%".
    expect(rows[0]?.deltaRatio).toBeNull()
  })

  it('categoria que sumiu aparece com queda, e não desaparece do gráfico', () => {
    const rows = categoryDeviation([], [fatia('Farmácia', 60_000)], {
      currentMonths: 1,
      baselineMonths: 1,
    })

    expect(rows[0]?.name).toBe('Farmácia')
    expect(rows[0]?.currentCents).toBe(0)
    expect(rows[0]?.deltaCents).toBe(-60_000)
    expect(rows[0]?.deltaRatio).toBe(-1)
  })

  it('ordena pelo maior desvio em reais, não pelo maior percentual', () => {
    const rows = categoryDeviation(
      [fatia('Mercado', 150_000), fatia('Cafe', 2_000)],
      [fatia('Mercado', 100_000), fatia('Cafe', 200)],
      { currentMonths: 1, baselineMonths: 1 },
    )

    // Café subiu 900% e Mercado 50%; o desvio que muda o mês é o do Mercado.
    expect(rows.map((row) => row.name)).toEqual(['Mercado', 'Cafe'])
  })

  it('ignora categoria sem movimento nos dois lados', () => {
    expect(
      categoryDeviation([fatia('Luz', 0)], [fatia('Luz', 0)], {
        currentMonths: 1,
        baselineMonths: 1,
      }),
    ).toEqual([])
  })

  it('recusa número de meses inválido em vez de dividir por zero', () => {
    expect(() =>
      categoryDeviation([], [], { currentMonths: 0, baselineMonths: 1 }),
    ).toThrow(/meses inválido/)
  })
})

describe('buildCommitment', () => {
  const linha = (
    month: string,
    kind: SourceTotal['kind'],
    source: SourceTotal['source'],
    totalCents: number,
  ): SourceTotal => ({ month, kind, source, totalCents })

  it('reparte as saídas do mês pela origem e calcula a sobra', () => {
    const rows = [
      linha('2026-09', 'income', 'manual', 800_000),
      linha('2026-09', 'expense', 'recurring', 250_000),
      linha('2026-09', 'expense', 'installment', 90_000),
      linha('2026-09', 'expense', 'manual', 160_000),
      linha('2026-09', 'expense', 'goal', 100_000),
    ]

    const [mes] = buildCommitment(rows, ['2026-09'])

    expect(mes?.incomeCents).toBe(800_000)
    expect(mes?.fixedCents).toBe(250_000)
    expect(mes?.installmentCents).toBe(90_000)
    expect(mes?.variableCents).toBe(160_000)
    expect(mes?.savedCents).toBe(100_000)
    expect(mes?.leftoverCents).toBe(200_000)
  })

  it('as cinco faixas somam exatamente a renda do mês', () => {
    const rows = [
      linha('2026-09', 'income', 'manual', 723_457),
      linha('2026-09', 'expense', 'recurring', 199_999),
      linha('2026-09', 'expense', 'manual', 3),
    ]
    const [mes] = buildCommitment(rows, ['2026-09'])

    const soma =
      (mes?.fixedCents ?? 0) +
      (mes?.installmentCents ?? 0) +
      (mes?.variableCents ?? 0) +
      (mes?.savedCents ?? 0) +
      (mes?.leftoverCents ?? 0)
    expect(soma).toBe(mes?.incomeCents)
  })

  it('a sobra fica negativa quando o mês gastou mais do que entrou', () => {
    const rows = [
      linha('2026-09', 'income', 'manual', 100_000),
      linha('2026-09', 'expense', 'recurring', 180_000),
    ]
    expect(buildCommitment(rows, ['2026-09'])[0]?.leftoverCents).toBe(-80_000)
  })

  it('mês sem lançamento ocupa o lugar dele, zerado', () => {
    const meses = buildCommitment([linha('2026-09', 'income', 'manual', 1)], [
      '2026-07',
      '2026-08',
      '2026-09',
    ])

    expect(meses.map((mes) => mes.month)).toEqual(['2026-07', '2026-08', '2026-09'])
    expect(meses[0]?.incomeCents).toBe(0)
    expect(meses[0]?.leftoverCents).toBe(0)
  })

  it('descarta mês fora do intervalo pedido', () => {
    const meses = buildCommitment(
      [
        linha('2026-09', 'income', 'manual', 500_000),
        linha('2026-01', 'income', 'manual', 999_999),
      ],
      ['2026-09'],
    )

    expect(meses).toHaveLength(1)
    expect(meses[0]?.incomeCents).toBe(500_000)
  })

  it('renda recorrente conta como renda, e não como conta fixa', () => {
    // Salário lançado por regra recorrente tem `source: 'recurring'` e `kind: 'income'`.
    const [mes] = buildCommitment([linha('2026-09', 'income', 'recurring', 700_000)], ['2026-09'])

    expect(mes?.incomeCents).toBe(700_000)
    expect(mes?.fixedCents).toBe(0)
    expect(mes?.leftoverCents).toBe(700_000)
  })
})

// v1.1 — 2026-09-27 (Fase 13): os juros de cartão e empréstimo são gasto do mês.
describe('buildCommitment — juros', () => {
  it('juros entram como gasto do mês, e a sobra desconta', () => {
    const [mes] = buildCommitment(
      [
        { month: '2026-09', kind: 'income', source: 'manual', totalCents: 100_000 },
        { month: '2026-09', kind: 'expense', source: 'manual', totalCents: 30_000 },
        { month: '2026-09', kind: 'expense', source: 'interest', totalCents: 8_000 },
      ],
      ['2026-09'],
    )
    expect(mes).toMatchObject({ variableCents: 38_000, leftoverCents: 62_000 })
  })
})
