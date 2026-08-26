import { describe, expect, it } from 'vitest'
import { firstNegativeDay, projectRange } from '@/lib/finance/projection'
import type { Entry, Goal, ProjectionData, RecurringRule, Scenario } from '@/lib/finance/types'

function entry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: 'entry-1',
    kind: 'expense',
    occurredOn: '2026-01-05',
    description: 'Mercado',
    amountCents: 15_000,
    categoryId: null,
    isSettled: true,
    source: 'manual',
    sourceId: null,
    occurrenceKey: null,
    installmentNumber: null,
    installmentTotal: null,
    ...overrides,
  }
}

function rule(overrides: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: 'rule-1',
    kind: 'expense',
    description: 'Aluguel',
    amountCents: 100_000,
    categoryId: null,
    frequency: 'monthly',
    dayOfMonth: 10,
    startsOn: '2026-01-01',
    endsOn: null,
    isActive: true,
    ...overrides,
  }
}

const emptyData: ProjectionData = { entries: [], recurringRules: [], goals: [] }

describe('projectRange — acumulação', () => {
  it('preenche todos os dias do intervalo, inclusive os sem movimento', () => {
    const result = projectRange({
      from: '2026-01-01',
      to: '2026-01-05',
      openingBalanceCents: 0,
      data: emptyData,
    })

    expect(result).toHaveLength(5)
    expect(result.map((d) => d.date)).toEqual([
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
      '2026-01-04',
      '2026-01-05',
    ])
    expect(result.every((d) => d.balanceCents === 0)).toBe(true)
  })

  it('acumula entradas e saídas dia a dia', () => {
    const result = projectRange({
      from: '2026-01-01',
      to: '2026-01-03',
      openingBalanceCents: 50_000,
      data: {
        ...emptyData,
        entries: [
          entry({ id: 'a', kind: 'income', amountCents: 30_000, occurredOn: '2026-01-02' }),
          entry({ id: 'b', kind: 'expense', amountCents: 10_000, occurredOn: '2026-01-03' }),
        ],
      },
    })

    expect(result.map((d) => d.balanceCents)).toEqual([50_000, 80_000, 70_000])
    expect(result[1]?.inflowCents).toBe(30_000)
    expect(result[2]?.outflowCents).toBe(10_000)
  })

  it('parte de saldo inicial negativo', () => {
    const result = projectRange({
      from: '2026-01-01',
      to: '2026-01-02',
      openingBalanceCents: -25_000,
      data: {
        ...emptyData,
        entries: [entry({ id: 'a', kind: 'income', amountCents: 10_000, occurredOn: '2026-01-02' })],
      },
    })

    expect(result.map((d) => d.balanceCents)).toEqual([-25_000, -15_000])
    expect(firstNegativeDay(result)?.date).toBe('2026-01-01')
  })

  it('devolve vazio quando o intervalo é invertido', () => {
    expect(
      projectRange({
        from: '2026-01-31',
        to: '2026-01-01',
        openingBalanceCents: 0,
        data: emptyData,
      }),
    ).toEqual([])
  })

  it('aponta o primeiro dia em que o saldo fica negativo', () => {
    const result = projectRange({
      from: '2026-01-01',
      to: '2026-01-31',
      openingBalanceCents: 50_000,
      data: { ...emptyData, recurringRules: [rule()] },
    })

    expect(firstNegativeDay(result)?.date).toBe('2026-01-10')
    expect(firstNegativeDay(result)?.balanceCents).toBe(-50_000)
  })
})

describe('projectRange — deduplicação', () => {
  it('não conta em dobro o custo fixo já materializado', () => {
    // O bug do app antigo: depois de marcar o fixo como pago, o lançamento real
    // e a projeção coexistiam e o mês era debitado duas vezes.
    const result = projectRange({
      from: '2026-01-01',
      to: '2026-01-31',
      openingBalanceCents: 0,
      data: {
        ...emptyData,
        recurringRules: [rule()],
        entries: [
          entry({
            id: 'materializado',
            description: 'Aluguel',
            amountCents: 100_000,
            occurredOn: '2026-01-10',
            source: 'recurring',
            sourceId: 'rule-1',
            occurrenceKey: '2026-01',
          }),
        ],
      },
    })

    const dia10 = result.find((d) => d.date === '2026-01-10')
    expect(dia10?.occurrences).toHaveLength(1)
    expect(dia10?.outflowCents).toBe(100_000)
    expect(result.at(-1)?.balanceCents).toBe(-100_000)
  })

  it('marca como realizada a ocorrência que veio de lançamento', () => {
    const result = projectRange({
      from: '2026-01-01',
      to: '2026-01-31',
      openingBalanceCents: 0,
      data: {
        ...emptyData,
        recurringRules: [rule()],
        entries: [
          entry({
            id: 'materializado',
            source: 'recurring',
            sourceId: 'rule-1',
            occurrenceKey: '2026-01',
            occurredOn: '2026-01-10',
            amountCents: 100_000,
            isSettled: true,
          }),
        ],
      },
    })

    const ocorrencia = result.find((d) => d.date === '2026-01-10')?.occurrences[0]
    expect(ocorrencia).toMatchObject({ isRealized: true, isSettled: true, origin: 'entry' })
  })

  it('mantém a projeção dos meses ainda não materializados', () => {
    const result = projectRange({
      from: '2026-01-01',
      to: '2026-03-31',
      openingBalanceCents: 0,
      data: {
        ...emptyData,
        recurringRules: [rule()],
        entries: [
          entry({
            id: 'jan',
            source: 'recurring',
            sourceId: 'rule-1',
            occurrenceKey: '2026-01',
            occurredOn: '2026-01-10',
            amountCents: 100_000,
          }),
        ],
      },
    })

    const comMovimento = result.filter((d) => d.occurrences.length > 0)
    expect(comMovimento.map((d) => d.date)).toEqual(['2026-01-10', '2026-02-10', '2026-03-10'])
    expect(result.at(-1)?.balanceCents).toBe(-300_000)
  })
})

describe('projectRange — metas', () => {
  function goal(overrides: Partial<Goal> = {}): Goal {
    return {
      id: 'goal-1',
      name: 'Viagem',
      targetAmountCents: 600_000,
      targetDate: '2026-06-30',
      monthlyContributionCents: null,
      savedCents: 0,
      archivedAt: null,
      ...overrides,
    }
  }

  it('usa o aporte mensal declarado', () => {
    const result = projectRange({
      from: '2026-01-01',
      to: '2026-02-28',
      openingBalanceCents: 0,
      data: { ...emptyData, goals: [goal({ monthlyContributionCents: 50_000 })] },
    })

    const comMovimento = result.filter((d) => d.occurrences.length > 0)
    expect(comMovimento.map((d) => d.date)).toEqual(['2026-01-31', '2026-02-28'])
    expect(comMovimento[0]?.outflowCents).toBe(50_000)
  })

  it('deriva o aporte do prazo real da meta', () => {
    // 600.000 em 6 meses (jan a jun) = 100.000/mês. O app antigo dividia pelo
    // tamanho do planejamento, ignorando a data-objetivo.
    const result = projectRange({
      from: '2026-01-01',
      to: '2026-01-31',
      openingBalanceCents: 0,
      data: { ...emptyData, goals: [goal()] },
    })

    expect(result.at(-1)?.outflowCents).toBe(100_000)
  })

  it('desconta o que já foi guardado', () => {
    const result = projectRange({
      from: '2026-01-01',
      to: '2026-01-31',
      openingBalanceCents: 0,
      data: { ...emptyData, goals: [goal({ savedCents: 300_000 })] },
    })

    expect(result.at(-1)?.outflowCents).toBe(50_000)
  })

  it('ignora meta arquivada ou já atingida', () => {
    const arquivada = projectRange({
      from: '2026-01-01',
      to: '2026-01-31',
      openingBalanceCents: 0,
      data: { ...emptyData, goals: [goal({ archivedAt: '2026-01-01T00:00:00Z' })] },
    })
    expect(arquivada.at(-1)?.outflowCents).toBe(0)

    const atingida = projectRange({
      from: '2026-01-01',
      to: '2026-01-31',
      openingBalanceCents: 0,
      data: { ...emptyData, goals: [goal({ savedCents: 600_000 })] },
    })
    expect(atingida.at(-1)?.outflowCents).toBe(0)
  })

  it('não projeta aporte depois do prazo', () => {
    const result = projectRange({
      from: '2026-01-01',
      to: '2026-08-31',
      openingBalanceCents: 0,
      data: { ...emptyData, goals: [goal()] },
    })

    const comMovimento = result.filter((d) => d.occurrences.length > 0)
    expect(comMovimento.at(-1)?.date).toBe('2026-06-30')
  })
})

describe('projectRange — cenários', () => {
  function scenario(overrides: Partial<Scenario> = {}): Scenario {
    return {
      id: 'scn-1',
      name: 'E se',
      startsOn: '2026-01-01',
      endsOn: '2026-03-31',
      openingBalanceCents: 0,
      overrides: [],
      entries: [],
      ...overrides,
    }
  }

  const dataComRegra: ProjectionData = { ...emptyData, recurringRules: [rule()] }

  it('exclui uma ocorrência sem tocar no dado real', () => {
    const result = projectRange({
      from: '2026-01-01',
      to: '2026-02-28',
      openingBalanceCents: 0,
      data: dataComRegra,
      scenario: scenario({
        overrides: [
          {
            targetType: 'recurring_rule',
            targetId: 'rule-1',
            occurrenceKey: '2026-01',
            isIncluded: false,
            amountCentsOverride: null,
            dateOverride: null,
          },
        ],
      }),
    })

    const comMovimento = result.filter((d) => d.occurrences.length > 0)
    expect(comMovimento.map((d) => d.date)).toEqual(['2026-02-10'])

    // O dado de origem continua intacto: sem cenário, janeiro volta a aparecer.
    const semCenario = projectRange({
      from: '2026-01-01',
      to: '2026-02-28',
      openingBalanceCents: 0,
      data: dataComRegra,
    })
    expect(semCenario.filter((d) => d.occurrences.length > 0)).toHaveLength(2)
  })

  it('troca o valor de uma ocorrência específica', () => {
    const result = projectRange({
      from: '2026-01-01',
      to: '2026-02-28',
      openingBalanceCents: 0,
      data: dataComRegra,
      scenario: scenario({
        overrides: [
          {
            targetType: 'recurring_rule',
            targetId: 'rule-1',
            occurrenceKey: '2026-02',
            isIncluded: true,
            amountCentsOverride: 120_000,
            dateOverride: null,
          },
        ],
      }),
    })

    expect(result.find((d) => d.date === '2026-01-10')?.outflowCents).toBe(100_000)
    expect(result.find((d) => d.date === '2026-02-10')?.outflowCents).toBe(120_000)
  })

  it('aplica override sem chave a todas as ocorrências', () => {
    const result = projectRange({
      from: '2026-01-01',
      to: '2026-02-28',
      openingBalanceCents: 0,
      data: dataComRegra,
      scenario: scenario({
        overrides: [
          {
            targetType: 'recurring_rule',
            targetId: 'rule-1',
            occurrenceKey: null,
            isIncluded: true,
            amountCentsOverride: 90_000,
            dateOverride: null,
          },
        ],
      }),
    })

    expect(result.find((d) => d.date === '2026-01-10')?.outflowCents).toBe(90_000)
    expect(result.find((d) => d.date === '2026-02-10')?.outflowCents).toBe(90_000)
  })

  it('override específico vence o que vale para todas', () => {
    const result = projectRange({
      from: '2026-01-01',
      to: '2026-02-28',
      openingBalanceCents: 0,
      data: dataComRegra,
      scenario: scenario({
        overrides: [
          {
            targetType: 'recurring_rule',
            targetId: 'rule-1',
            occurrenceKey: null,
            isIncluded: true,
            amountCentsOverride: 90_000,
            dateOverride: null,
          },
          {
            targetType: 'recurring_rule',
            targetId: 'rule-1',
            occurrenceKey: '2026-02',
            isIncluded: true,
            amountCentsOverride: 10_000,
            dateOverride: null,
          },
        ],
      }),
    })

    expect(result.find((d) => d.date === '2026-01-10')?.outflowCents).toBe(90_000)
    expect(result.find((d) => d.date === '2026-02-10')?.outflowCents).toBe(10_000)
  })

  it('move a ocorrência de data', () => {
    const result = projectRange({
      from: '2026-01-01',
      to: '2026-01-31',
      openingBalanceCents: 0,
      data: dataComRegra,
      scenario: scenario({
        overrides: [
          {
            targetType: 'recurring_rule',
            targetId: 'rule-1',
            occurrenceKey: '2026-01',
            isIncluded: true,
            amountCentsOverride: null,
            dateOverride: '2026-01-20',
          },
        ],
      }),
    })

    expect(result.find((d) => d.date === '2026-01-10')?.occurrences).toHaveLength(0)
    expect(result.find((d) => d.date === '2026-01-20')?.outflowCents).toBe(100_000)
  })

  it('soma itens hipotéticos do cenário', () => {
    const result = projectRange({
      from: '2026-01-01',
      to: '2026-01-31',
      openingBalanceCents: 500_000,
      data: emptyData,
      scenario: scenario({
        entries: [
          {
            id: 'extra-1',
            kind: 'expense',
            description: 'Trocar de celular',
            amountCents: 300_000,
            occursOn: '2026-01-15',
            categoryId: null,
          },
        ],
      }),
    })

    expect(result.find((d) => d.date === '2026-01-15')?.outflowCents).toBe(300_000)
    expect(result.at(-1)?.balanceCents).toBe(200_000)
  })

  it('exclui lançamento real dentro do cenário sem apagá-lo', () => {
    const dados: ProjectionData = {
      ...emptyData,
      entries: [entry({ id: 'gasto-1', amountCents: 20_000, occurredOn: '2026-01-05' })],
    }

    const comCenario = projectRange({
      from: '2026-01-01',
      to: '2026-01-31',
      openingBalanceCents: 0,
      data: dados,
      scenario: scenario({
        overrides: [
          {
            targetType: 'entry',
            targetId: 'gasto-1',
            occurrenceKey: null,
            isIncluded: false,
            amountCentsOverride: null,
            dateOverride: null,
          },
        ],
      }),
    })

    expect(comCenario.at(-1)?.balanceCents).toBe(0)
    expect(dados.entries).toHaveLength(1)
  })
})
