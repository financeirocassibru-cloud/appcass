import { describe, expect, it } from 'vitest'
import {
  centsFromInitial,
  formatCents,
  parseCents,
  popCentsDigit,
  pushCentsDigit,
} from '@/lib/finance/money'

/**
 * O campo de valor guarda centavos, não texto. Estes testes descrevem o que o
 * usuário vê ao digitar, que é o contrato do componente em
 * `components/finance/money-input.tsx`.
 */

/** Simula digitar uma sequência de teclas num campo vazio. */
function digitar(teclas: string): number {
  return [...teclas].reduce((cents, tecla) => pushCentsDigit(cents, tecla), 0)
}

describe('pushCentsDigit', () => {
  it('desloca a vírgula da direita para a esquerda', () => {
    expect(digitar('1')).toBe(1) // R$ 0,01
    expect(digitar('12')).toBe(12) // R$ 0,12
    expect(digitar('123')).toBe(123) // R$ 1,23
    expect(digitar('1234')).toBe(1234) // R$ 12,34
  })

  it('formata o que o usuário vê a cada tecla', () => {
    const vistos = ['1', '12', '123', '1234'].map((seq) =>
      formatCents(digitar(seq)).replace(/ /g, ' '),
    )
    expect(vistos).toEqual(['R$ 0,01', 'R$ 0,12', 'R$ 1,23', 'R$ 12,34'])
  })

  it('ignora zero à esquerda sem quebrar', () => {
    expect(digitar('000')).toBe(0)
    expect(digitar('0005')).toBe(5)
    expect(formatCents(digitar('0005')).replace(/ /g, ' ')).toBe('R$ 0,05')
  })

  it('ignora tecla que não é dígito', () => {
    expect(pushCentsDigit(1234, ',')).toBe(1234)
    expect(pushCentsDigit(1234, '.')).toBe(1234)
    expect(pushCentsDigit(1234, 'a')).toBe(1234)
    expect(pushCentsDigit(1234, '')).toBe(1234)
    expect(pushCentsDigit(1234, '12')).toBe(1234)
  })

  it('para no teto em vez de truncar o valor já digitado', () => {
    // R$ 99.999.999,99 — acrescentar outro dígito não pode alterar o que está na
    // tela, então o estado permanece.
    const teto = 9_999_999_999
    expect(pushCentsDigit(teto, '9')).toBe(teto)
    expect(pushCentsDigit(999_999_999, '9')).toBe(9_999_999_999)
  })
})

describe('popCentsDigit', () => {
  it('apaga o dígito da direita', () => {
    expect(popCentsDigit(1234)).toBe(123)
    expect(popCentsDigit(123)).toBe(12)
    expect(popCentsDigit(12)).toBe(1)
    expect(popCentsDigit(1)).toBe(0)
  })

  it('permanece em zero', () => {
    expect(popCentsDigit(0)).toBe(0)
  })

  it('digitar e apagar volta ao estado anterior', () => {
    const antes = digitar('1234')
    expect(popCentsDigit(pushCentsDigit(antes, '5'))).toBe(antes)
  })
})

describe('parseCents ao colar', () => {
  it('aceita as formas que aparecem numa mensagem', () => {
    expect(parseCents('12,34')).toBe(1234)
    expect(parseCents('R$ 12,34')).toBe(1234)
    expect(parseCents('1.234,56')).toBe(123_456)
  })
})

describe('centsFromInitial', () => {
  it('aceita valor existente na tela de edição', () => {
    expect(centsFromInitial(1234)).toBe(1234)
    expect(centsFromInitial(0)).toBe(0)
  })

  it('recusa entrada que não serve como estado do campo', () => {
    expect(centsFromInitial(undefined)).toBe(0)
    expect(centsFromInitial(null)).toBe(0)
    expect(centsFromInitial(-500)).toBe(0)
    expect(centsFromInitial(12.5)).toBe(0)
    expect(centsFromInitial(10_000_000_000)).toBe(0)
  })
})
