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

describe('contrato com a migration 0010', () => {
  /**
   * `create_installment_plan` recebe as parcelas prontas em JSON e confere a
   * soma antes de gravar. O que a função espera de cada item está fixado aqui,
   * porque é um contrato entre TypeScript e SQL: o `number` vira
   * `occurrence_key` (texto) e `installment_number` (smallint), e divergir
   * quebraria a unicidade que impede a parcela duplicada.
   */
  const plano = (total: number, count: number) =>
    planInstallments({
      id: 'plano-1',
      description: 'Sofá',
      categoryId: null,
      totalAmountCents: total,
      installmentsCount: count,
      firstDueOn: '2026-03-10',
    })

  it('a chave de ocorrência é o número da parcela, em texto', () => {
    const parcelas = plano(10_000, 3)
    expect(parcelas.map((p) => p.occurrenceKey)).toEqual(['1', '2', '3'])
  })

  it('a chave casa com o installment_number, que o banco lê como smallint', () => {
    for (const parcela of plano(10_000, 12)) {
      expect(Number(parcela.occurrenceKey)).toBe(parcela.installmentNumber)
      expect(Number.isInteger(Number(parcela.occurrenceKey))).toBe(true)
    }
  })

  it('toda parcela tem valor positivo — o banco recusa zero ou negativo', () => {
    for (const parcela of plano(101, 100)) {
      expect(parcela.amountCents).toBeGreaterThan(0)
    }
  })

  it('a soma bate com o total em muitas combinações', () => {
    // A conferência que a função do banco repete antes de gravar. Se esta
    // invariante cair, o parcelamento é recusado lá — mas o erro tem de
    // aparecer aqui primeiro.
    for (let total = 1; total <= 400; total += 7) {
      for (const count of [2, 3, 4, 5, 7, 12, 13]) {
        if (count > total) continue
        const soma = plano(total, count).reduce((s, p) => s + p.amountCents, 0)
        expect(soma).toBe(total)
      }
    }
  })

  it('as datas saem em YYYY-MM-DD, que é o que o cast para date espera', () => {
    for (const parcela of plano(10_000, 14)) {
      expect(parcela.dueOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
})
