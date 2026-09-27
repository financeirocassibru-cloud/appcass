import { describe, expect, it } from 'vitest'
import {
  MAX_KEYWORDS,
  matchCategoryByKeywords,
  normalizeText,
  parseKeywords,
  type KeywordCategory,
} from '@/lib/finance/keywords'

/** Palavras-chave de categoria. v1.0 — 2026-09-27. */

const categories: KeywordCategory[] = [
  { id: 'alimentacao', kind: 'expense', keywords: ['iFood', 'Rappi', 'padaria'] },
  { id: 'mercado', kind: 'expense', keywords: ['supermercado', 'Açougue'] },
  { id: 'lazer', kind: 'expense', keywords: ['bar', 'cinema'] },
  { id: 'salario', kind: 'income', keywords: ['salário'] },
  { id: 'arquivada', kind: 'expense', keywords: ['uber'], archivedAt: '2026-01-01T00:00:00Z' },
]

describe('normalizeText', () => {
  it('tira acento, caixa e pontuação', () => {
    expect(normalizeText('IFD*IFOOD  São Paulo!')).toBe('ifd ifood sao paulo')
    expect(normalizeText('Açaí')).toBe('acai')
  })
})

describe('parseKeywords', () => {
  it('separa por vírgula, ponto e vírgula e linha, sem vazias nem repetidas', () => {
    expect(parseKeywords('iFood, rappi;\n IFOOD ,, Ifóod')).toEqual(['iFood', 'rappi'])
  })

  it('aceita lista pronta e respeita o teto', () => {
    const muitas = Array.from({ length: 40 }, (_, i) => `palavra${i}`)
    expect(parseKeywords(muitas)).toHaveLength(MAX_KEYWORDS)
  })

  it('corta palavra longa demais', () => {
    expect(parseKeywords(['x'.repeat(60)])[0]).toHaveLength(40)
  })
})

describe('matchCategoryByKeywords', () => {
  it('casa sem acento e sem caixa, dentro de texto colado pelo banco', () => {
    expect(matchCategoryByKeywords('Compra no débito · IFD*IFOOD', 'expense', categories)).toEqual({
      categoryId: 'alimentacao',
      keyword: 'iFood',
    })
    expect(matchCategoryByKeywords('ACOUGUE DO ZE', 'expense', categories)?.categoryId).toBe('mercado')
  })

  it('palavra curta só casa inteira: "bar" não pega "barbearia"', () => {
    expect(matchCategoryByKeywords('Barbearia do João', 'expense', categories)).toBeNull()
    expect(matchCategoryByKeywords('Bar do João', 'expense', categories)?.categoryId).toBe('lazer')
  })

  it('respeita o tipo: palavra de entrada não classifica saída', () => {
    expect(matchCategoryByKeywords('Adiantamento de salário', 'expense', categories)).toBeNull()
    expect(matchCategoryByKeywords('Salário setembro', 'income', categories)?.categoryId).toBe(
      'salario',
    )
  })

  it('ignora categoria arquivada', () => {
    expect(matchCategoryByKeywords('Uber trip', 'expense', categories)).toBeNull()
  })

  it('a palavra-chave mais longa vence entre categorias diferentes', () => {
    const cats: KeywordCategory[] = [
      { id: 'a', kind: 'expense', keywords: ['posto'] },
      { id: 'b', kind: 'expense', keywords: ['posto shell'] },
    ]
    expect(matchCategoryByKeywords('POSTO SHELL CENTRO', 'expense', cats)?.categoryId).toBe('b')
  })

  it('empate de tamanho entre categorias diferentes não decide', () => {
    const cats: KeywordCategory[] = [
      { id: 'a', kind: 'expense', keywords: ['farma'] },
      { id: 'b', kind: 'expense', keywords: ['droga'] },
    ]
    expect(matchCategoryByKeywords('Drogaria Farmacia', 'expense', cats)).toBeNull()
  })

  it('sem nada casando devolve null', () => {
    expect(matchCategoryByKeywords('Pix para Fulano', 'expense', categories)).toBeNull()
    expect(matchCategoryByKeywords('', 'expense', categories)).toBeNull()
  })
})
