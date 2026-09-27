import { describe, expect, it } from 'vitest'
import type { KeywordCategory } from '@/lib/finance/keywords'
import {
  aiGroups,
  aiProposals,
  diffProposals,
  keywordProposals,
  type RecategorizeTarget,
} from '@/lib/import/recategorize'

/** Categorizar de novo o que já existe. v1.0 — 2026-09-27. */

const categories: KeywordCategory[] = [
  { id: 'comida', kind: 'expense', keywords: ['ifood'] },
  { id: 'transporte', kind: 'expense', keywords: ['uber'] },
]

const targets: RecategorizeTarget[] = [
  { id: '1', description: 'Compra no débito · iFood', kind: 'expense', categoryId: null },
  { id: '2', description: 'Compra no débito · iFood', kind: 'expense', categoryId: 'transporte' },
  { id: '3', description: 'Uber trip', kind: 'expense', categoryId: 'transporte' },
  { id: '4', description: 'Pix para Fulano', kind: 'expense', categoryId: null },
]

describe('keywordProposals', () => {
  it('sem sobrescrever, só preenche o que está sem categoria', () => {
    expect(keywordProposals(targets, categories, false)).toEqual([
      { id: '1', categoryId: 'comida', source: { type: 'keyword', keyword: 'ifood' } },
    ])
  })

  it('sobrescrevendo, troca a que está errada e ignora a que já está certa', () => {
    expect(keywordProposals(targets, categories, true).map((p) => p.id)).toEqual(['1', '2'])
  })
})

describe('aiGroups', () => {
  it('agrupa por contraparte e tipo, só entre os elegíveis', () => {
    const { groups, idsByKey } = aiGroups(targets, true)
    expect(groups.map((g) => g.key)).toEqual([
      'expense:compra no debito ifood',
      'expense:uber trip',
      'expense:pix para fulano',
    ])
    expect(idsByKey.get('expense:compra no debito ifood')).toEqual(['1', '2'])
    expect(aiGroups(targets, false).groups).toHaveLength(2)
  })
})

describe('aiProposals', () => {
  it('leva a resposta do grupo a cada linha dele, sem repetir a categoria atual', () => {
    const { idsByKey } = aiGroups(targets, true)
    const proposals = aiProposals(targets, idsByKey, {
      'expense:compra no debito ifood': 'comida',
      'expense:uber trip': 'transporte',
    })
    expect(proposals).toEqual([
      { id: '1', categoryId: 'comida', source: { type: 'ai' } },
      { id: '2', categoryId: 'comida', source: { type: 'ai' } },
    ])
  })
})

describe('diffProposals', () => {
  it('descarta id que não foi pedido', () => {
    expect(diffProposals(targets, [{ id: 'x', categoryId: 'comida', source: { type: 'ai' } }])).toEqual([])
  })
})
