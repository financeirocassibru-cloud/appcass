import { describe, expect, it } from 'vitest'
import { planInstallments } from '@/lib/finance/installments'
import { sumCents } from '@/lib/finance/money'

describe('planInstallments', () => {
  it('gera parcelas cent-exatas', () => {
    const parcelas = planInstallments({
      id: 'plan-1',
      description: 'Notebook',
      categoryId: null,
      totalAmountCents: 10_000,
      installmentsCount: 3,
      firstDueOn: '2026-01-10',
    })

    expect(parcelas.map((p) => p.amountCents)).toEqual([3334, 3333, 3333])
    expect(sumCents(parcelas.map((p) => p.amountCents))).toBe(10_000)
  })

  it('avança um mês por parcela', () => {
    const parcelas = planInstallments({
      id: 'plan-1',
      description: 'Notebook',
      categoryId: null,
      totalAmountCents: 30_000,
      installmentsCount: 3,
      firstDueOn: '2026-01-10',
    })

    expect(parcelas.map((p) => p.dueOn)).toEqual(['2026-01-10', '2026-02-10', '2026-03-10'])
  })

  it('ajusta o vencimento do dia 31 sem perder parcela', () => {
    const parcelas = planInstallments({
      id: 'plan-1',
      description: 'Sofá',
      categoryId: null,
      totalAmountCents: 40_000,
      installmentsCount: 4,
      firstDueOn: '2026-01-31',
    })

    expect(parcelas.map((p) => p.dueOn)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ])
  })

  it('numera a descrição e a chave de ocorrência', () => {
    const parcelas = planInstallments({
      id: 'plan-1',
      description: 'Notebook',
      categoryId: 'cat-1',
      totalAmountCents: 20_000,
      installmentsCount: 2,
      firstDueOn: '2026-01-10',
    })

    expect(parcelas[0]).toMatchObject({
      description: 'Notebook (1/2)',
      occurrenceKey: '1',
      installmentNumber: 1,
      installmentTotal: 2,
      categoryId: 'cat-1',
      kind: 'expense',
    })
    expect(parcelas[1]?.occurrenceKey).toBe('2')
  })

  it('trata compra em uma parcela', () => {
    const parcelas = planInstallments({
      id: 'plan-1',
      description: 'Livro',
      categoryId: null,
      totalAmountCents: 4_990,
      installmentsCount: 1,
      firstDueOn: '2026-01-10',
    })

    expect(parcelas).toHaveLength(1)
    expect(parcelas[0]?.amountCents).toBe(4_990)
  })

  it('mantém a soma exata em parcelamentos longos', () => {
    const parcelas = planInstallments({
      id: 'plan-1',
      description: 'Carro',
      categoryId: null,
      totalAmountCents: 4_999_999,
      installmentsCount: 48,
      firstDueOn: '2026-01-15',
    })

    expect(parcelas).toHaveLength(48)
    expect(sumCents(parcelas.map((p) => p.amountCents))).toBe(4_999_999)
    expect(parcelas.at(-1)?.dueOn).toBe('2029-12-15')
  })
})
