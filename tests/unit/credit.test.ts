import { describe, expect, it } from 'vitest'
import { computeBalance } from '@/lib/finance/balance'
import {
  availableLimitCents,
  buildBills,
  cardClosingFor,
  cardDueFor,
  chargesOf,
  competenceCents,
  defaultFirstDue,
  entryCreditStatus,
  excessInterestCents,
  isCashEntry,
  paymentOf,
  recurringCharges,
  type CreditAccount,
  type CreditCharge,
  type CreditPayment,
} from '@/lib/finance/credit'
import { sumCents } from '@/lib/finance/money'
import { projectWindow } from '@/lib/finance/projection'
import type { Entry, RecurringRule } from '@/lib/finance/types'

/**
 * Cartões e empréstimos — v1.0 — 2026-09-27 (Fase 13).
 *
 * O gasto no cartão conta na categoria na data do gasto, e sai do saldo só pela fatura. Estes
 * testes afirmam as duas metades e, principalmente, que elas nunca se sobrepõem.
 */

const HOJE = '2026-09-27'

const cartao: CreditAccount = {
  id: 'nubank',
  kind: 'card',
  name: 'Nubank',
  limitCents: 500_000,
  closingDay: 3,
  dueDay: 10,
  dueOn: null,
  keywords: [],
  archivedAt: null,
}

const emprestimo: CreditAccount = {
  id: 'banco',
  kind: 'loan',
  name: 'Empréstimo do banco',
  limitCents: null,
  closingDay: null,
  dueDay: 5,
  dueOn: null,
  keywords: [],
  archivedAt: null,
}

const entry = (over: Partial<Entry> = {}): Entry => ({
  id: 'e1',
  kind: 'expense',
  occurredOn: HOJE,
  description: 'Uber',
  amountCents: 3_000,
  categoryId: 'transporte',
  isSettled: false,
  source: 'manual',
  sourceId: null,
  occurrenceKey: null,
  installmentNumber: null,
  installmentTotal: null,
  ...over,
})

const charge = (dueOn: string, amountCents: number, entryId = 'e1'): CreditCharge => ({
  accountId: cartao.id,
  dueOn,
  amountCents,
  entryId,
  ruleId: null,
  occurredOn: HOJE,
  description: 'Compra',
  categoryId: null,
  kind: 'expense',
  source: 'manual',
  number: 1,
  total: 1,
})

const payment = (dueOn: string, amountCents: number, interestCents = 0): CreditPayment => ({
  entryId: `p-${dueOn}-${amountCents}`,
  accountId: cartao.id,
  dueOn,
  paidOn: dueOn,
  amountCents,
  interestCents,
})

describe('cardDueFor — o ciclo do cartão (a mesma regra de credit_first_due, 0021)', () => {
  it('compra até o fechamento entra na fatura que fecha naquele mês', () => {
    expect(cardDueFor('2026-09-03', 3, 10)).toBe('2026-09-10')
    expect(cardDueFor('2026-09-01', 3, 10)).toBe('2026-09-10')
  })

  it('compra depois do fechamento vai para a seguinte', () => {
    expect(cardDueFor('2026-09-04', 3, 10)).toBe('2026-10-10')
  })

  it('vencimento antes do fechamento no calendário é do mês seguinte', () => {
    expect(cardDueFor('2026-09-20', 25, 5)).toBe('2026-10-05')
    expect(cardDueFor('2026-09-26', 25, 5)).toBe('2026-11-05')
  })

  it('fechamento no dia 31 cai no fim de fevereiro', () => {
    expect(cardDueFor('2026-02-28', 31, 10)).toBe('2026-03-10')
    expect(cardDueFor('2028-02-29', 31, 10)).toBe('2028-03-10')
  })

  it('nunca vence no próprio dia do fechamento', () => {
    // Fechamento 30 e vencimento 31 viram 28 e 28 em fevereiro.
    expect(cardDueFor('2026-02-10', 30, 31)).toBe('2026-03-31')
  })

  it('o fechamento de uma fatura é o inverso do vencimento', () => {
    expect(cardClosingFor('2026-10-10', 3, 10)).toBe('2026-10-03')
    expect(cardClosingFor('2026-10-05', 25, 5)).toBe('2026-09-25')
  })
})

describe('defaultFirstDue', () => {
  it('empréstimo com dia fixo: o próximo dia depois do gasto', () => {
    expect(defaultFirstDue(emprestimo, '2026-09-05')).toBe('2026-10-05')
    expect(defaultFirstDue(emprestimo, '2026-09-04')).toBe('2026-09-05')
  })

  it('empréstimo de vencimento único; já passado ou sem vencimento pede a data', () => {
    const unico = { ...emprestimo, dueDay: null, dueOn: '2026-12-01' }
    expect(defaultFirstDue(unico, '2026-09-15')).toBe('2026-12-01')
    expect(defaultFirstDue(unico, '2026-12-02')).toBeNull()
    expect(defaultFirstDue({ ...emprestimo, dueDay: null }, '2026-09-15')).toBeNull()
  })
})

describe('chargesOf — a dívida em cobranças cent-exatas', () => {
  it('à vista: uma cobrança com o valor', () => {
    const compra = entry({ creditAccountId: cartao.id, chargeFirstDueOn: '2026-10-10' })
    expect(chargesOf(compra, cartao).map((c) => [c.dueOn, c.amountCents])).toEqual([
      ['2026-10-10', 3_000],
    ])
  })

  it('valor a pagar com juros, em parcelas mensais no dia fixo', () => {
    const recebido = entry({
      kind: 'income',
      amountCents: 500_000,
      interestCents: 76_000,
      creditAccountId: emprestimo.id,
      chargeFirstDueOn: '2026-10-05',
      chargeCount: 12,
    })
    const cobrancas = chargesOf(recebido, emprestimo)
    expect(cobrancas).toHaveLength(12)
    expect(cobrancas[11]!.dueOn).toBe('2027-09-05')
    expect(sumCents(cobrancas.map((c) => c.amountCents))).toBe(576_000)
  })

  it('invariante: a soma das cobranças é valor + juros, para qualquer divisão', () => {
    for (let total = 1; total <= 2_000; total += 137) {
      for (const count of [1, 2, 3, 7, 12, 36]) {
        const e = entry({
          amountCents: total,
          interestCents: total % 11,
          creditAccountId: cartao.id,
          chargeFirstDueOn: '2026-01-31',
          chargeCount: count,
        })
        expect(sumCents(chargesOf(e, cartao).map((c) => c.amountCents))).toBe(total + (total % 11))
      }
    }
  })

  it('lançamento do saldo não tem cobrança', () => {
    expect(chargesOf(entry(), cartao)).toEqual([])
  })
})

describe('buildBills — as faturas derivadas', () => {
  const base = { account: cartao, carriedDueOns: new Set<string>(), today: HOJE }

  it('soma as cobranças por vencimento e diz se a fatura está aberta ou fechada', () => {
    const bills = buildBills({
      ...base,
      charges: [charge('2026-10-10', 3_000), charge('2026-10-10', 7_000, 'e2'), charge('2026-11-10', 500, 'e3')],
      payments: [],
    })
    expect(bills.map((b) => [b.dueOn, b.totalCents, b.status])).toEqual([
      ['2026-10-10', 10_000, 'open'],
      ['2026-11-10', 500, 'open'],
    ])
  })

  it('fatura fechada: passou o dia do fechamento e ainda não venceu', () => {
    const bills = buildBills({ ...base, today: '2026-10-05', charges: [charge('2026-10-10', 1_000)], payments: [] })
    expect(bills[0]!.status).toBe('closed')
  })

  it('pagamento integral quita', () => {
    const bills = buildBills({
      ...base,
      charges: [charge('2026-09-10', 100_000)],
      payments: [payment('2026-09-10', 100_000)],
    })
    expect(bills[0]!.status).toBe('paid')
    expect(bills[0]!.remainingCents).toBe(0)
  })

  it('vencida sem pagamento continua devida ali — não rola', () => {
    const bills = buildBills({ ...base, charges: [charge('2026-09-10', 100_000)], payments: [] })
    expect(bills.map((b) => [b.status, b.remainingCents])).toEqual([['overdue', 100_000]])
  })

  it('pagamento parcial vencido rola o restante para a seguinte (rotativo)', () => {
    const bills = buildBills({
      ...base,
      charges: [charge('2026-09-10', 100_000), charge('2026-10-10', 50_000, 'e2')],
      payments: [payment('2026-09-10', 30_000)],
    })
    expect(bills.map((b) => [b.dueOn, b.status, b.totalCents, b.remainingCents])).toEqual([
      ['2026-09-10', 'rolled', 100_000, 70_000],
      ['2026-10-10', 'open', 120_000, 120_000],
    ])
  })

  it('o rotativo cria a fatura seguinte quando ela ainda não existe', () => {
    const bills = buildBills({
      ...base,
      charges: [charge('2026-09-10', 100_000)],
      payments: [payment('2026-09-10', 30_000)],
    })
    expect(bills.map((b) => [b.dueOn, b.carryInCents])).toEqual([
      ['2026-09-10', 0],
      ['2026-10-10', 70_000],
    ])
  })

  it('pagamento parcial ainda não vencido espera o resto no próprio vencimento', () => {
    const bills = buildBills({
      ...base,
      charges: [charge('2026-10-10', 100_000)],
      payments: [payment('2026-10-10', 30_000)],
    })
    expect(bills.map((b) => [b.status, b.remainingCents])).toEqual([['partial', 70_000]])
  })

  it('parcelado: o restante não rola — as parcelas já são cobranças das seguintes', () => {
    const bills = buildBills({
      ...base,
      carriedDueOns: new Set(['2026-09-10']),
      charges: [charge('2026-09-10', 100_000), charge('2026-10-10', 13_000, 'carry')],
      payments: [payment('2026-09-10', 30_000)],
    })
    expect(bills.map((b) => [b.status, b.totalCents])).toEqual([
      ['carried', 100_000],
      ['open', 13_000],
    ])
  })

  it('o excedente do pagamento é juro: não abate a fatura', () => {
    const bills = buildBills({
      ...base,
      charges: [charge('2026-09-10', 100_000)],
      payments: [payment('2026-09-10', 108_000, 8_000)],
    })
    expect(bills[0]!.paidCents).toBe(100_000)
    expect(bills[0]!.status).toBe('paid')
    expect(excessInterestCents({ remainingCents: 100_000 }, 108_000)).toBe(8_000)
    expect(excessInterestCents({ remainingCents: 100_000 }, 30_000)).toBe(0)
  })

  it('limite disponível: tudo o que ainda é devido, desta fatura em diante', () => {
    const bills = buildBills({
      ...base,
      charges: [charge('2026-09-10', 100_000), charge('2026-10-10', 50_000, 'e2'), charge('2027-01-10', 20_000, 'e3')],
      payments: [payment('2026-09-10', 100_000)],
    })
    expect(availableLimitCents(cartao, bills)).toBe(500_000 - 70_000)
    expect(availableLimitCents({ ...cartao, limitCents: null }, bills)).toBeNull()
  })

  it('o selo da compra: paga quando a fatura dela está paga', () => {
    const bills = buildBills({
      ...base,
      charges: [charge('2026-09-10', 1_000, 'a'), charge('2026-10-10', 1_000, 'b')],
      payments: [payment('2026-09-10', 1_000)],
    })
    expect(entryCreditStatus('a', bills)).toMatchObject({ isPaid: true, dueOn: '2026-09-10' })
    expect(entryCreditStatus('b', bills)).toMatchObject({ isPaid: false, dueOn: '2026-10-10' })
    expect(entryCreditStatus('nenhum', bills)).toBeNull()
  })
})

describe('paymentOf', () => {
  it('lê o vencimento da chave, inclusive do segundo pagamento', () => {
    const pago = entry({
      id: 'p',
      source: 'credit_bill',
      sourceId: cartao.id,
      occurrenceKey: '2026-10-10:2',
      isSettled: true,
      amountCents: 500,
    })
    expect(paymentOf(pago)).toMatchObject({ dueOn: '2026-10-10', amountCents: 500 })
    expect(paymentOf(entry())).toBeNull()
  })
})

describe('recurringCharges — conta fixa no cartão', () => {
  const streaming: RecurringRule = {
    id: 'r1',
    kind: 'expense',
    description: 'Streaming',
    amountCents: 5_590,
    categoryId: null,
    frequency: 'monthly',
    dayOfMonth: 15,
    startsOn: '2026-01-01',
    endsOn: null,
    isActive: true,
    creditAccountId: cartao.id,
  }

  it('cobra nas faturas que vencem de hoje em diante, e não inventa fatura vencida', () => {
    const charges = recurringCharges(streaming, cartao, HOJE, '2026-12-31', [])
    // `to` limita a data da ocorrência, não a do vencimento. 15/08 → fatura de 10/09
    // (vencida): fora. 15/09 → 10/10; 15/10 → 10/11; …
    expect(charges.map((c) => [c.occurredOn, c.dueOn])).toEqual([
      ['2026-09-15', '2026-10-10'],
      ['2026-10-15', '2026-11-10'],
      ['2026-11-15', '2026-12-10'],
      ['2026-12-15', '2027-01-10'],
    ])
  })

  it('a ocorrência materializada sai da previsão (ela já é cobrança pelo lançamento)', () => {
    const materializada = entry({ source: 'recurring', sourceId: 'r1', occurrenceKey: '2026-09' })
    const charges = recurringCharges(streaming, cartao, HOJE, '2026-10-31', [materializada])
    expect(charges.map((c) => c.occurredOn)).toEqual(['2026-10-15'])
  })
})

describe('as duas leituras nunca se sobrepõem', () => {
  it('competência: compra conta, fatura e dinheiro de empréstimo não; juros sempre', () => {
    expect(competenceCents(entry({ creditAccountId: 'c', amountCents: 3_000 }))).toEqual({
      principalCents: 3_000,
      interestCents: 0,
    })
    expect(competenceCents(entry({ source: 'credit_bill', amountCents: 108_000, interestCents: 8_000 }))).toEqual({
      principalCents: 0,
      interestCents: 8_000,
    })
    expect(competenceCents(entry({ source: 'credit_carry', amountCents: 70_000, interestCents: 8_000 }))).toEqual({
      principalCents: 0,
      interestCents: 8_000,
    })
    expect(
      competenceCents(entry({ kind: 'income', creditAccountId: 'l', amountCents: 500_000, interestCents: 76_000 })),
    ).toEqual({ principalCents: 0, interestCents: 76_000 })
  })

  it('caixa: a compra no cartão não mexe no saldo; o dinheiro do empréstimo mexe', () => {
    expect(isCashEntry(entry({ creditAccountId: 'c' }))).toBe(false)
    expect(isCashEntry(entry({ kind: 'income', creditAccountId: 'l' }))).toBe(true)
    expect(isCashEntry(entry())).toBe(true)
  })

  it('Uber no cartão: o saldo não muda hoje, e a fatura sai no vencimento — uma vez só', () => {
    const uber = entry({ creditAccountId: cartao.id, chargeFirstDueOn: '2026-10-10' })
    const bills = buildBills({
      account: cartao,
      charges: chargesOf(uber, cartao),
      payments: [],
      carriedDueOns: new Set(),
      today: HOJE,
    })

    const saldo = computeBalance({
      openingBalanceCents: 100_000,
      openingBalanceOn: '2026-09-01',
      today: HOJE,
      entries: [uber],
    })
    expect(saldo.currentCents).toBe(100_000)

    const days = projectWindow({
      from: HOJE,
      to: '2026-10-31',
      today: HOJE,
      openingBalanceCents: 100_000,
      data: { entries: [uber], recurringRules: [], goals: [], creditBills: bills },
    })
    const saidas = days.reduce((sum, d) => sum + d.outflowCents, 0)
    expect(saidas).toBe(3_000)
    expect(days.find((d) => d.date === '2026-10-10')!.outflowCents).toBe(3_000)
    expect(days.at(-1)!.balanceCents).toBe(97_000)
  })

  it('fatura paga: o pagamento é o caixa, e a fatura não é prevista de novo', () => {
    const uber = entry({ creditAccountId: cartao.id, chargeFirstDueOn: '2026-09-10', occurredOn: '2026-09-01' })
    const pago = entry({
      id: 'p',
      source: 'credit_bill',
      sourceId: cartao.id,
      occurrenceKey: '2026-09-10',
      occurredOn: '2026-09-10',
      isSettled: true,
      amountCents: 3_000,
    })
    const bills = buildBills({
      account: cartao,
      charges: chargesOf(uber, cartao),
      payments: [paymentOf(pago)!],
      carriedDueOns: new Set(),
      today: HOJE,
    })
    const saldo = computeBalance({
      openingBalanceCents: 100_000,
      openingBalanceOn: '2026-09-01',
      today: HOJE,
      entries: [uber, pago],
    })
    expect(saldo.currentCents).toBe(97_000)

    const days = projectWindow({
      from: '2026-09-01',
      to: '2026-10-31',
      today: HOJE,
      openingBalanceCents: 100_000,
      data: { entries: [uber, pago], recurringRules: [], goals: [], creditBills: bills },
    })
    expect(days.reduce((sum, d) => sum + d.outflowCents, 0)).toBe(3_000)
  })

  it('conta fixa no cartão não é expandida como caixa', () => {
    const rule: RecurringRule = {
      id: 'r1',
      kind: 'expense',
      description: 'Streaming',
      amountCents: 5_590,
      categoryId: null,
      frequency: 'monthly',
      dayOfMonth: 15,
      startsOn: '2026-01-01',
      endsOn: null,
      isActive: true,
      creditAccountId: cartao.id,
    }
    const days = projectWindow({
      from: HOJE,
      to: '2026-10-31',
      today: HOJE,
      openingBalanceCents: 0,
      data: { entries: [], recurringRules: [rule], goals: [] },
    })
    expect(days.reduce((sum, d) => sum + d.outflowCents, 0)).toBe(0)
  })
})
