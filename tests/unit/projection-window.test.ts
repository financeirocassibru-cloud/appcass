import { describe, expect, it } from 'vitest'
import { computeBalance } from '@/lib/finance/balance'
import { entriesAheadOf, projectRange, rollOverdueTo } from '@/lib/finance/projection'
import type { Entry } from '@/lib/finance/types'

/**
 * O saldo atual e a projeção dividem os mesmos lançamentos em dois grupos. Se
 * os grupos se sobrepuserem, o valor entra duas vezes no saldo projetado — e o
 * app passa a mentir justamente no número que existe para orientar a decisão.
 *
 * Estes testes afirmam que a divisão é exata: nenhum lançamento em ambos,
 * nenhum em nenhum.
 */

const HOJE = '2026-03-15'

const entry = (over: Partial<Entry> = {}): Entry => ({
  id: 'e1',
  kind: 'expense',
  occurredOn: HOJE,
  description: 'Mercado',
  amountCents: 10_000,
  categoryId: null,
  isSettled: false,
  source: 'manual',
  sourceId: null,
  occurrenceKey: null,
  installmentNumber: null,
  installmentTotal: null,
  ...over,
})

describe('entriesAheadOf', () => {
  it('exclui o liquidado até hoje, que já está no saldo', () => {
    const liquidadoHoje = entry({ id: 'a', isSettled: true, occurredOn: HOJE })
    const liquidadoOntem = entry({ id: 'b', isSettled: true, occurredOn: '2026-03-14' })

    expect(entriesAheadOf([liquidadoHoje, liquidadoOntem], HOJE)).toEqual([])
  })

  it('inclui o pendente, inclusive o atrasado', () => {
    const pendenteFuturo = entry({ id: 'a', occurredOn: '2026-03-20' })
    const pendenteAtrasado = entry({ id: 'b', occurredOn: '2026-02-10' })

    const ahead = entriesAheadOf([pendenteFuturo, pendenteAtrasado], HOJE)
    expect(ahead.map((e) => e.id)).toEqual(['a', 'b'])
  })

  it('inclui o liquidado com data futura, que o saldo ainda não viu', () => {
    const liquidadoAmanha = entry({ id: 'a', isSettled: true, occurredOn: '2026-03-16' })
    expect(entriesAheadOf([liquidadoAmanha], HOJE).map((e) => e.id)).toEqual(['a'])
  })

  it('a divisão é exata: cada lançamento cai em um grupo e só um', () => {
    const todos = [
      entry({ id: 'a', isSettled: true, occurredOn: '2026-03-10' }),
      entry({ id: 'b', isSettled: true, occurredOn: HOJE }),
      entry({ id: 'c', isSettled: true, occurredOn: '2026-03-20' }),
      entry({ id: 'd', isSettled: false, occurredOn: '2026-02-01' }),
      entry({ id: 'e', isSettled: false, occurredOn: HOJE }),
      entry({ id: 'f', isSettled: false, occurredOn: '2026-03-30' }),
    ]

    const noSaldo = todos.filter((e) => e.isSettled && e.occurredOn <= HOJE)
    const naProjecao = entriesAheadOf(todos, HOJE)

    // Nenhum em ambos.
    const idsNoSaldo = new Set(noSaldo.map((e) => e.id))
    expect(naProjecao.filter((e) => idsNoSaldo.has(e.id))).toEqual([])

    // Nenhum de fora.
    expect(noSaldo.length + naProjecao.length).toBe(todos.length)
  })
})

describe('rollOverdueTo', () => {
  it('traz o vencido para o primeiro dia da janela', () => {
    const rolled = rollOverdueTo([entry({ occurredOn: '2026-01-05' })], HOJE)
    expect(rolled[0]?.occurredOn).toBe(HOJE)
  })

  it('não mexe no que vence hoje ou depois', () => {
    const rolled = rollOverdueTo(
      [entry({ id: 'a', occurredOn: HOJE }), entry({ id: 'b', occurredOn: '2026-04-01' })],
      HOJE,
    )
    expect(rolled.map((e) => e.occurredOn)).toEqual([HOJE, '2026-04-01'])
  })

  it('não perde nenhum item', () => {
    const items = [entry({ id: 'a', occurredOn: '2026-01-01' }), entry({ id: 'b' })]
    expect(rollOverdueTo(items, HOJE)).toHaveLength(2)
  })
})

describe('saldo e projeção encaixados', () => {
  it('um gasto liquidado hoje não é descontado duas vezes', () => {
    // A regressão que isto barra: o saldo já desconta o gasto liquidado hoje;
    // se a projeção, que começa hoje, também o enxergasse, o dia de hoje
    // fecharia com o valor descontado em dobro.
    const gastoDeHoje = entry({ isSettled: true, occurredOn: HOJE, amountCents: 30_000 })

    const saldo = computeBalance({
      openingBalanceCents: 100_000,
      openingBalanceOn: '2026-03-01',
      today: HOJE,
      entries: [gastoDeHoje],
    })
    expect(saldo.currentCents).toBe(70_000)

    const dias = projectRange({
      from: HOJE,
      to: '2026-03-17',
      openingBalanceCents: saldo.currentCents,
      data: {
        entries: entriesAheadOf([gastoDeHoje], HOJE),
        recurringRules: [],
        goals: [],
      },
    })

    // 70.000 e não 40.000.
    expect(dias[0]?.balanceCents).toBe(70_000)
    expect(dias.at(-1)?.balanceCents).toBe(70_000)
  })

  it('uma conta atrasada derruba o saldo projetado no primeiro dia', () => {
    const atrasada = entry({ occurredOn: '2026-02-10', amountCents: 50_000 })

    const dias = projectRange({
      from: HOJE,
      to: '2026-03-17',
      openingBalanceCents: 100_000,
      data: {
        entries: rollOverdueTo(entriesAheadOf([atrasada], HOJE), HOJE),
        recurringRules: [],
        goals: [],
      },
    })

    expect(dias[0]?.balanceCents).toBe(50_000)
  })

  it('a conta atrasada não some da projeção por ter vencido antes da janela', () => {
    // Sem `rollOverdueTo` ela cairia fora de [from, to] e a projeção pareceria
    // melhor do que é — o erro que faz gastar dinheiro que não existe.
    const atrasada = entry({ occurredOn: '2026-02-10', amountCents: 50_000 })

    const semRolagem = projectRange({
      from: HOJE,
      to: '2026-03-17',
      openingBalanceCents: 100_000,
      data: { entries: entriesAheadOf([atrasada], HOJE), recurringRules: [], goals: [] },
    })

    expect(semRolagem[0]?.balanceCents).toBe(100_000)
    expect(semRolagem.at(-1)?.balanceCents).toBe(100_000)
  })
})
