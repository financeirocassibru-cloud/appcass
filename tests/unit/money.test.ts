import { describe, expect, it } from 'vitest'
import { formatCents, MoneyError, parseCents, splitCents, sumCents } from '@/lib/finance/money'

describe('splitCents', () => {
  it('distribui o resto entre as primeiras parcelas', () => {
    // O caso do app antigo: 100,00 em 3x dava 33.333333... em float.
    expect(splitCents(10_000, 3)).toEqual([3334, 3333, 3333])
  })

  it('divide exato quando não há resto', () => {
    expect(splitCents(9_000, 3)).toEqual([3000, 3000, 3000])
  })

  it('devolve o próprio total em uma parcela', () => {
    expect(splitCents(12_345, 1)).toEqual([12_345])
  })

  it('trata zero', () => {
    expect(splitCents(0, 4)).toEqual([0, 0, 0, 0])
  })

  it('mantém a soma exata com totais negativos', () => {
    const parts = splitCents(-10_000, 3)
    expect(sumCents(parts)).toBe(-10_000)
    expect(parts).toEqual([-3334, -3333, -3333])
  })

  it('rejeita número de parcelas inválido', () => {
    expect(() => splitCents(1000, 0)).toThrow(MoneyError)
    expect(() => splitCents(1000, -2)).toThrow(MoneyError)
    expect(() => splitCents(1000, 1.5)).toThrow(MoneyError)
  })

  it('rejeita total fracionário — centavos são inteiros', () => {
    expect(() => splitCents(10.5, 2)).toThrow(MoneyError)
  })

  // A invariante que sustenta todo o cálculo de parcelas e metas.
  it('property: a soma das partes é sempre igual ao total', () => {
    let seed = 20260826
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    }

    for (let i = 0; i < 2000; i += 1) {
      const total = Math.trunc((random() - 0.4) * 5_000_000)
      const parts = 1 + Math.trunc(random() * 360)
      const split = splitCents(total, parts)

      expect(split).toHaveLength(parts)
      expect(sumCents(split)).toBe(total)
      // Nenhuma parcela pode divergir de outra por mais de um centavo.
      const min = Math.min(...split)
      const max = Math.max(...split)
      expect(max - min).toBeLessThanOrEqual(1)
    }
  })
})

describe('parseCents', () => {
  it.each([
    ['1234,56', 123_456],
    ['1.234,56', 123_456],
    ['1234.56', 123_456],
    ['1234', 123_400],
    ['0,05', 5],
    ['0,5', 50],
    ['R$ 1.234,56', 123_456],
    ['-99,90', -9990],
  ])('interpreta %s como %i centavos', (input, expected) => {
    expect(parseCents(input)).toBe(expected)
  })

  it('trata separador de milhar sem decimais', () => {
    expect(parseCents('1.234')).toBe(123_400)
  })

  it('devolve null para entrada não interpretável', () => {
    expect(parseCents('')).toBeNull()
    expect(parseCents('   ')).toBeNull()
    expect(parseCents('abc')).toBeNull()
    expect(parseCents('1,234567')).toBeNull()
  })
})

describe('formatCents', () => {
  it('formata em real brasileiro', () => {
    // O separador do Intl é espaço não-quebrável.
    expect(formatCents(123_456).replace(/ /g, ' ')).toBe('R$ 1.234,56')
    expect(formatCents(0).replace(/ /g, ' ')).toBe('R$ 0,00')
  })
})
