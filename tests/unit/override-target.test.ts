import { describe, expect, it } from 'vitest'
import { overrideTargetOf, projectRange } from '@/lib/finance/projection'
import type { Entry, Occurrence, RecurringRule, Scenario } from '@/lib/finance/types'

/**
 * Teste de ida e volta do override.
 *
 * A tela grava o override a partir de `overrideTargetOf()`; o motor o lê de
 * volta com a mesma função. Estes testes exercem o ciclo inteiro, porque um
 * override que não casa **não dá erro** — ele simplesmente não faz nada, e a
 * pessoa vê o gasto que mandou excluir continuar na projeção.
 */

const HOJE = '2026-03-01'

const regra: RecurringRule = {
  id: 'regra-1',
  kind: 'expense',
  description: 'Aluguel',
  amountCents: 180_000,
  categoryId: null,
  frequency: 'monthly',
  dayOfMonth: 10,
  startsOn: '2026-01-10',
  endsOn: null,
  isActive: true,
}

const avulso: Entry = {
  id: 'entrada-1',
  kind: 'expense',
  occurredOn: '2026-03-05',
  description: 'Mercado',
  amountCents: 20_000,
  categoryId: null,
  isSettled: false,
  source: 'manual',
  sourceId: null,
  occurrenceKey: null,
  installmentNumber: null,
  installmentTotal: null,
}

/** O override que a tela gravaria para uma ocorrência, excluindo-a. */
function excluir(occurrence: Occurrence) {
  const target = overrideTargetOf(occurrence)
  return {
    targetType: target.targetType,
    targetId: target.targetId,
    occurrenceKey: target.occurrenceKey,
    isIncluded: false,
    amountCentsOverride: null,
    dateOverride: null,
  }
}

function cenario(overrides: Scenario['overrides'], entries: Scenario['entries'] = []): Scenario {
  return {
    id: 'cen-1',
    name: 'Teste',
    startsOn: HOJE,
    endsOn: '2026-04-30',
    openingBalanceCents: 0,
    overrides,
    entries,
  }
}

function projetar(scenario?: Scenario) {
  return projectRange({
    from: HOJE,
    to: '2026-04-30',
    openingBalanceCents: 100_000,
    data: { entries: [avulso], recurringRules: [regra], goals: [] },
    scenario,
  })
}

describe('overrideTargetOf', () => {
  it('aponta a regra, e não a ocorrência, numa conta fixa', () => {
    const [ocorrencia] = projetar().flatMap((d) => d.occurrences).filter((o) => o.origin === 'recurring')
    expect(overrideTargetOf(ocorrencia!)).toEqual({
      targetType: 'recurring_rule',
      targetId: 'regra-1',
      occurrenceKey: '2026-03',
    })
  })

  it('aponta o próprio lançamento num gasto avulso', () => {
    const [ocorrencia] = projetar().flatMap((d) => d.occurrences).filter((o) => o.origin === 'entry')
    expect(overrideTargetOf(ocorrencia!)).toEqual({
      targetType: 'entry',
      targetId: 'entrada-1',
      occurrenceKey: null,
    })
  })
})

describe('ida e volta: gravar o override e ver a projeção mudar', () => {
  it('excluir uma ocorrência de conta fixa tira só aquele mês', () => {
    const marco = projetar()
      .flatMap((d) => d.occurrences)
      .find((o) => o.origin === 'recurring' && o.date === '2026-03-10')

    const comCenario = projetar(cenario([excluir(marco!)]))

    const recorrentes = comCenario.flatMap((d) => d.occurrences).filter((o) => o.origin === 'recurring')
    expect(recorrentes.map((o) => o.date)).toEqual(['2026-04-10'])
  })

  it('excluir um gasto avulso o tira da projeção', () => {
    const gasto = projetar()
      .flatMap((d) => d.occurrences)
      .find((o) => o.origin === 'entry')

    const comCenario = projetar(cenario([excluir(gasto!)]))
    expect(comCenario.flatMap((d) => d.occurrences).filter((o) => o.origin === 'entry')).toEqual([])
  })

  it('o saldo final reflete a exclusão', () => {
    const gasto = projetar().flatMap((d) => d.occurrences).find((o) => o.origin === 'entry')

    const semCenario = projetar().at(-1)!.balanceCents
    const comCenario = projetar(cenario([excluir(gasto!)])).at(-1)!.balanceCents

    expect(comCenario - semCenario).toBe(20_000)
  })

  it('mudar o valor de uma ocorrência muda só ela', () => {
    const marco = projetar()
      .flatMap((d) => d.occurrences)
      .find((o) => o.origin === 'recurring' && o.date === '2026-03-10')

    const target = overrideTargetOf(marco!)
    const dias = projetar(
      cenario([
        {
          ...target,
          isIncluded: true,
          amountCentsOverride: 50_000,
          dateOverride: null,
        },
      ]),
    )

    const valores = dias
      .flatMap((d) => d.occurrences)
      .filter((o) => o.origin === 'recurring')
      .map((o) => o.amountCents)

    expect(valores).toEqual([50_000, 180_000])
  })

  it('mudar a data move a ocorrência de dia', () => {
    const marco = projetar()
      .flatMap((d) => d.occurrences)
      .find((o) => o.origin === 'recurring' && o.date === '2026-03-10')

    const dias = projetar(
      cenario([
        {
          ...overrideTargetOf(marco!),
          isIncluded: true,
          amountCentsOverride: null,
          dateOverride: '2026-03-25',
        },
      ]),
    )

    const datas = dias
      .flatMap((d) => d.occurrences)
      .filter((o) => o.origin === 'recurring')
      .map((o) => o.date)

    expect(datas).toEqual(['2026-03-25', '2026-04-10'])
  })

  it('um override sem chave vale para todas as ocorrências do alvo', () => {
    const dias = projetar(
      cenario([
        {
          targetType: 'recurring_rule',
          targetId: 'regra-1',
          occurrenceKey: null,
          isIncluded: false,
          amountCentsOverride: null,
          dateOverride: null,
        },
      ]),
    )

    expect(dias.flatMap((d) => d.occurrences).filter((o) => o.origin === 'recurring')).toEqual([])
  })

  it('um item hipotético entra na projeção sem existir em lugar nenhum', () => {
    const dias = projetar(
      cenario(
        [],
        [
          {
            id: 'hip-1',
            kind: 'expense',
            description: 'Carro novo',
            amountCents: 500_000,
            occursOn: '2026-03-20',
            categoryId: null,
          },
        ],
      ),
    )

    const semCenario = projetar().at(-1)!.balanceCents
    expect(dias.at(-1)!.balanceCents).toBe(semCenario - 500_000)
  })

  it('o cenário não altera a projeção real', () => {
    // A garantia central da fase 5: o cenário é uma lente, não uma escrita.
    const gasto = projetar().flatMap((d) => d.occurrences).find((o) => o.origin === 'entry')
    projetar(cenario([excluir(gasto!)]))

    expect(avulso.amountCents).toBe(20_000)
    expect(regra.amountCents).toBe(180_000)
    expect(projetar().flatMap((d) => d.occurrences).filter((o) => o.origin === 'entry')).toHaveLength(1)
  })
})
