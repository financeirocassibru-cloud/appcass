import { describe, expect, it } from 'vitest'
import { duplicateHabits } from '@/lib/finance/habits'
import { creditPatch } from '@/lib/validation/credit'
import { createEntrySchema, updateEntrySchema } from '@/lib/validation/entries'

/**
 * O "Pago com" no formulário — v1.0 — 2026-09-27 (Fase 13).
 *
 * Ausente não é vazio: um formulário que não manda o campo (o assistente) não pode soltar a
 * compra do cartão; `''` é "do saldo" e zera a dívida.
 */

// Como a action monta: `formData.get()` devolve `null` para o campo que não veio.
const base = {
  kind: 'expense',
  amountCents: '3000',
  occurredOn: '2026-09-27',
  description: 'Uber',
  categoryId: '',
  isSettled: 'on',
  keywords: null,
  creditAccountId: null,
  chargeFirstDueOn: null,
  chargeCount: null,
  chargeTotalCents: null,
}

const CARD = '11111111-1111-4111-8111-111111111111'

describe('createEntrySchema — pago com', () => {
  it('sem o campo, a dívida não é tocada', () => {
    const parsed = createEntrySchema.parse(base)
    expect(parsed.creditAccountId).toBeUndefined()
    expect(creditPatch(parsed)).toEqual({})
  })

  it('vazio é o saldo: zera a conta, o vencimento e os juros', () => {
    const parsed = createEntrySchema.parse({ ...base, creditAccountId: '' })
    expect(creditPatch(parsed)).toEqual({
      credit_account_id: null,
      charge_first_due_on: null,
      charge_count: 1,
      interest_cents: 0,
    })
  })

  it('no cartão: vencimento obrigatório; valor a pagar vira juros', () => {
    expect(createEntrySchema.safeParse({ ...base, creditAccountId: CARD }).success).toBe(false)

    const parsed = createEntrySchema.parse({
      ...base,
      creditAccountId: CARD,
      chargeFirstDueOn: '2026-10-10',
      chargeCount: '12',
      chargeTotalCents: '3600',
    })
    expect(creditPatch(parsed)).toEqual({
      credit_account_id: CARD,
      charge_first_due_on: '2026-10-10',
      charge_count: 12,
      interest_cents: 600,
    })
  })

  it('valor a pagar menor que o valor é recusado', () => {
    const result = updateEntrySchema.safeParse({
      ...base,
      id: CARD,
      creditAccountId: CARD,
      chargeFirstDueOn: '2026-10-10',
      chargeTotalCents: '2000',
    })
    expect(result.success).toBe(false)
  })
})

describe('duplicateHabits — dinheiro de empréstimo não é hábito', () => {
  it('copia a compra no cartão, e não o empréstimo recebido', () => {
    const copies = duplicateHabits({
      entries: [
        { kind: 'expense', description: 'Uber', amountCents: 3000, occurredOn: '2026-08-05', categoryId: null, source: 'manual', creditAccountId: CARD },
        { kind: 'income', description: 'Empréstimo', amountCents: 500000, occurredOn: '2026-08-05', categoryId: null, source: 'manual', creditAccountId: CARD },
      ],
      sourceMonth: '2026-08',
      targetMonths: ['2026-10'],
      kinds: 'all',
      from: '2026-09-27',
      to: '2026-12-31',
    })
    expect(copies.map((c) => c.description)).toEqual(['Uber'])
  })
})
