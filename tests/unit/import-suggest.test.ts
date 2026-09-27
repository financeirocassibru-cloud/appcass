import { describe, expect, it } from 'vitest'
import { readCategorySuggestions, suggestFromHistory } from '@/lib/import/suggest'

/** Sugestão de categoria na importação de extrato. v1.0 — 2026-09-27. */

const TRANSPORTE = '00000000-0000-4000-8000-000000000001'
const COMIDA = '00000000-0000-4000-8000-000000000002'
const SALARIO = '00000000-0000-4000-8000-000000000003'

describe('suggestFromHistory', () => {
  it('repete a categoria mais usada para a mesma descrição', () => {
    const history = [
      { description: 'Compra no débito via NuPay · 99', kind: 'expense' as const, categoryId: TRANSPORTE },
      { description: 'Compra no débito via NuPay · 99', kind: 'expense' as const, categoryId: TRANSPORTE },
      { description: 'Compra no débito via NuPay · 99', kind: 'expense' as const, categoryId: COMIDA },
    ]
    expect(suggestFromHistory([{ description: 'Compra no débito via NuPay · 99', kind: 'expense' }], history)).toEqual([TRANSPORTE])
  })

  it('casa lançamento manual pelo "de quem"', () => {
    const history = [{ description: 'iFood', kind: 'expense' as const, categoryId: COMIDA }]
    expect(suggestFromHistory([{ description: 'Compra no débito via NuPay · iFood', kind: 'expense' }], history)).toEqual([COMIDA])
  })

  it('nunca atravessa o tipo', () => {
    const history = [{ description: 'Pix de Empresa Exemplo', kind: 'income' as const, categoryId: SALARIO }]
    expect(suggestFromHistory([{ description: 'Pix de Empresa Exemplo', kind: 'expense' }], history)).toEqual([null])
  })
})

describe('readCategorySuggestions', () => {
  const groups = [
    { key: 'expense:99', description: 'Compra · 99', kind: 'expense' as const },
    { key: 'income:empresa', description: 'Pix de Empresa', kind: 'income' as const },
  ]
  const categories = [
    { id: TRANSPORTE, name: 'Transporte', kind: 'expense' as const, keywords: [] },
    { id: SALARIO, name: 'Salário', kind: 'income' as const, keywords: [] },
  ]

  it('aceita só id existente, do mesmo tipo, para chave pedida', () => {
    const raw = {
      items: [
        { key: 'expense:99', category_id: TRANSPORTE },
        { key: 'income:empresa', category_id: TRANSPORTE }, // tipo errado
        { key: 'inventada', category_id: SALARIO }, // chave não pedida
        { key: 'expense:99', category_id: 'nao-existe' },
      ],
    }
    expect(readCategorySuggestions(raw, groups, categories)).toEqual({ 'expense:99': TRANSPORTE })
  })

  it('resposta ilegível vira nada', () => {
    expect(readCategorySuggestions('texto solto', groups, categories)).toEqual({})
    expect(readCategorySuggestions({ items: 'x' }, groups, categories)).toEqual({})
  })
})
