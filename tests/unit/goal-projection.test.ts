import { describe, expect, it } from 'vitest'
import { entriesAheadOf, projectRange } from '@/lib/finance/projection'
import type { Entry, Goal } from '@/lib/finance/types'

/**
 * Metas dentro da projeção.
 *
 * O aporte de uma meta é **previsão**, não lançamento: ele não existe em
 * `entries` e não sai da conta sozinho. A projeção o mostra para que o saldo
 * futuro não pareça maior do que será se a pessoa realmente guardar o dinheiro.
 *
 * O app antigo dividia o valor total pela quantidade de meses do planejamento,
 * ignorando o prazo real da meta e o que já havia sido guardado. Aqui os dois
 * entram na conta.
 */

const HOJE = '2026-03-01'

const meta = (over: Partial<Goal> = {}): Goal => ({
  id: 'meta-1',
  name: 'Viagem',
  targetAmountCents: 600_000,
  targetDate: '2026-08-31',
  monthlyContributionCents: null,
  savedCents: 0,
  archivedAt: null,
  ...over,
})

function projetar(goals: Goal[], entries: Entry[] = []) {
  return projectRange({
    from: HOJE,
    to: '2026-08-31',
    openingBalanceCents: 1_000_000,
    data: { entries: entriesAheadOf(entries, HOJE), recurringRules: [], goals },
  })
}

describe('metas na projeção', () => {
  it('lança um aporte por mês, no último dia', () => {
    const aportes = projetar([meta()])
      .flatMap((d) => d.occurrences)
      .filter((o) => o.origin === 'goal')

    // Março a agosto: seis meses, seis aportes.
    expect(aportes).toHaveLength(6)
    expect(aportes.map((a) => a.date)).toEqual([
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
      '2026-06-30',
      '2026-07-31',
      '2026-08-31',
    ])
  })

  it('o aporte derivado considera o que já foi guardado', () => {
    // Faltam 300.000 em 6 meses = 50.000 por mês, e não 100.000.
    const aportes = projetar([meta({ savedCents: 300_000 })])
      .flatMap((d) => d.occurrences)
      .filter((o) => o.origin === 'goal')

    expect(aportes[0]?.amountCents).toBe(50_000)
  })

  it('o aporte informado ganha do derivado', () => {
    const aportes = projetar([meta({ monthlyContributionCents: 70_000 })])
      .flatMap((d) => d.occurrences)
      .filter((o) => o.origin === 'goal')

    expect(aportes.every((a) => a.amountCents === 70_000)).toBe(true)
  })

  it('meta já cumprida não gera aporte', () => {
    const aportes = projetar([meta({ savedCents: 600_000 })])
      .flatMap((d) => d.occurrences)
      .filter((o) => o.origin === 'goal')

    expect(aportes).toEqual([])
  })

  it('meta arquivada não gera aporte', () => {
    const aportes = projetar([meta({ archivedAt: '2026-02-01T00:00:00Z' })])
      .flatMap((d) => d.occurrences)
      .filter((o) => o.origin === 'goal')

    expect(aportes).toEqual([])
  })

  it('o aporte derruba o saldo projetado', () => {
    const semMeta = projetar([]).at(-1)!.balanceCents
    const comMeta = projetar([meta()]).at(-1)!.balanceCents

    // Seis aportes de 100.000.
    expect(semMeta - comMeta).toBe(600_000)
  })

  it('o aporte é previsão, não lançamento realizado', () => {
    // A diferença muda o que a pessoa faz com a informação: o aporte só sai da
    // conta se ela de fato transferir o dinheiro.
    const aportes = projetar([meta()])
      .flatMap((d) => d.occurrences)
      .filter((o) => o.origin === 'goal')

    expect(aportes.every((a) => a.isRealized === false)).toBe(true)
    expect(aportes.every((a) => a.isSettled === false)).toBe(true)
  })

  it('meta sem prazo e sem aporte definido não projeta nada', () => {
    // Sem prazo não há como derivar o mensal, e chutar um valor seria pior que
    // não mostrar: a projeção ficaria errada sem a pessoa saber por quê.
    const aportes = projetar([meta({ targetDate: null })])
      .flatMap((d) => d.occurrences)
      .filter((o) => o.origin === 'goal')

    expect(aportes).toEqual([])
  })

  it('meta sem prazo mas com aporte definido projeta o aporte', () => {
    const aportes = projetar([meta({ targetDate: null, monthlyContributionCents: 30_000 })])
      .flatMap((d) => d.occurrences)
      .filter((o) => o.origin === 'goal')

    expect(aportes.length).toBeGreaterThan(0)
    expect(aportes.every((a) => a.amountCents === 30_000)).toBe(true)
  })

  it('metas e lançamentos convivem sem se atrapalhar', () => {
    const gasto: Entry = {
      id: 'e1',
      kind: 'expense',
      occurredOn: '2026-03-15',
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

    const dias = projetar([meta()], [gasto])
    const origens = new Set(dias.flatMap((d) => d.occurrences).map((o) => o.origin))

    expect(origens).toEqual(new Set(['goal', 'entry']))
    expect(dias.at(-1)!.balanceCents).toBe(1_000_000 - 600_000 - 20_000)
  })
})
