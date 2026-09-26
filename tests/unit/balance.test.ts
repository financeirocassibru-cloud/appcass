import { describe, expect, it } from 'vitest'
import { computeBalance, type BalanceEntry } from '@/lib/finance/balance'

/**
 * O saldo é o número que a pessoa abre o app para ver. Cada teste aqui descreve
 * uma forma de ele estar errado com aparência de certo.
 */

const pago = (over: Partial<BalanceEntry> = {}): BalanceEntry => ({
  kind: 'expense',
  amountCents: 10_000,
  occurredOn: '2026-03-10',
  isSettled: true,
  ...over,
})

describe('computeBalance', () => {
  it('parte da âncora quando não há lançamento', () => {
    const saldo = computeBalance({
      openingBalanceCents: 250_000,
      openingBalanceOn: '2026-03-01',
      today: '2026-03-31',
      entries: [],
    })
    expect(saldo.currentCents).toBe(250_000)
    expect(saldo.countedEntries).toBe(0)
  })

  it('soma entradas e subtrai saídas liquidadas', () => {
    const saldo = computeBalance({
      openingBalanceCents: 100_000,
      openingBalanceOn: '2026-03-01',
      today: '2026-03-31',
      entries: [
        pago({ kind: 'income', amountCents: 500_000 }),
        pago({ kind: 'expense', amountCents: 120_000 }),
        pago({ kind: 'expense', amountCents: 30_000 }),
      ],
    })
    expect(saldo.settledIncomeCents).toBe(500_000)
    expect(saldo.settledExpenseCents).toBe(150_000)
    expect(saldo.currentCents).toBe(450_000)
  })

  it('ignora pendente: compromisso não é dinheiro que já saiu', () => {
    const saldo = computeBalance({
      openingBalanceCents: 100_000,
      openingBalanceOn: '2026-03-01',
      today: '2026-03-31',
      entries: [pago({ amountCents: 80_000, isSettled: false })],
    })
    expect(saldo.currentCents).toBe(100_000)
    expect(saldo.settledExpenseCents).toBe(0)
    expect(saldo.countedEntries).toBe(0)
  })

  it('ignora lançamento anterior à âncora, que já está embutido nela', () => {
    const saldo = computeBalance({
      openingBalanceCents: 100_000,
      openingBalanceOn: '2026-03-01',
      today: '2026-03-31',
      entries: [
        pago({ occurredOn: '2026-02-28', amountCents: 90_000 }),
        pago({ occurredOn: '2026-03-01', amountCents: 10_000 }),
      ],
    })
    // Só o do dia da âncora entra — a janela é fechada nas duas pontas.
    expect(saldo.currentCents).toBe(90_000)
    expect(saldo.countedEntries).toBe(1)
  })

  it('ignora lançamento posterior a hoje', () => {
    const saldo = computeBalance({
      openingBalanceCents: 100_000,
      openingBalanceOn: '2026-03-01',
      today: '2026-03-10',
      entries: [
        pago({ occurredOn: '2026-03-10', amountCents: 5_000 }),
        pago({ occurredOn: '2026-03-11', amountCents: 70_000 }),
      ],
    })
    expect(saldo.currentCents).toBe(95_000)
  })

  it('âncora no futuro devolve a própria âncora, sem despencar', () => {
    // O erro que este teste barra: tratar a janela como "tudo até hoje" quando
    // `from > to`. Aí todos os gastos entrariam e o saldo cairia sem explicação.
    const saldo = computeBalance({
      openingBalanceCents: 100_000,
      openingBalanceOn: '2026-04-01',
      today: '2026-03-15',
      entries: [pago({ occurredOn: '2026-03-10', amountCents: 90_000 })],
    })
    expect(saldo.currentCents).toBe(100_000)
    expect(saldo.countedEntries).toBe(0)
  })

  it('aceita saldo negativo: quem está no vermelho tem saldo negativo', () => {
    const saldo = computeBalance({
      openingBalanceCents: 10_000,
      openingBalanceOn: '2026-03-01',
      today: '2026-03-31',
      entries: [pago({ amountCents: 35_000 })],
    })
    expect(saldo.currentCents).toBe(-25_000)
  })

  it('aceita âncora negativa', () => {
    const saldo = computeBalance({
      openingBalanceCents: -50_000,
      openingBalanceOn: '2026-03-01',
      today: '2026-03-31',
      entries: [pago({ kind: 'income', amountCents: 20_000 })],
    })
    expect(saldo.currentCents).toBe(-30_000)
  })

  it('opera em centavos inteiros, sem perder o último centavo', () => {
    const saldo = computeBalance({
      openingBalanceCents: 1,
      openingBalanceOn: '2026-03-01',
      today: '2026-03-31',
      entries: [
        pago({ kind: 'income', amountCents: 33 }),
        pago({ kind: 'income', amountCents: 33 }),
        pago({ kind: 'income', amountCents: 34 }),
      ],
    })
    expect(saldo.currentCents).toBe(101)
    expect(Number.isInteger(saldo.currentCents)).toBe(true)
  })

  it('não desloca o dia na virada de mês', () => {
    // A janela compara strings `YYYY-MM-DD`, então 01/03 nunca cai em 28/02.
    const saldo = computeBalance({
      openingBalanceCents: 0,
      openingBalanceOn: '2026-03-01',
      today: '2026-03-01',
      entries: [pago({ occurredOn: '2026-03-01', kind: 'income', amountCents: 700 })],
    })
    expect(saldo.currentCents).toBe(700)
  })

  it('preserva a âncora no resultado, para a tela mostrar a premissa', () => {
    const saldo = computeBalance({
      openingBalanceCents: 4_200,
      openingBalanceOn: '2026-03-02',
      today: '2026-03-31',
      entries: [],
    })
    expect(saldo.openingBalanceCents).toBe(4_200)
    expect(saldo.openingBalanceOn).toBe('2026-03-02')
  })
})
