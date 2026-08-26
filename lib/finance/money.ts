/**
 * Dinheiro em centavos inteiros.
 *
 * O app antigo guardava valores em ponto flutuante e dividia com `/`
 * (`valorTotal / parcelas`), o que fazia centavos sumirem ou sobrarem nas
 * parcelas. Aqui todo valor é um inteiro de centavos e todo rateio passa por
 * `splitCents`, que garante que a soma das partes volta ao total.
 */

/** Erro de uso da API de dinheiro — sempre bug de programação, nunca do usuário. */
export class MoneyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MoneyError'
  }
}

function assertSafeCents(value: number, label: string): void {
  if (!Number.isInteger(value)) {
    throw new MoneyError(`${label} deve ser um inteiro de centavos, recebido ${value}`)
  }
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} excede o inteiro seguro do JavaScript: ${value}`)
  }
}

/**
 * Divide um total em `parts` parcelas cujo somatório é exatamente o total.
 *
 * O resto da divisão é distribuído de um em um centavo entre as primeiras
 * parcelas, então R$ 100,00 em 3x vira 33,34 + 33,33 + 33,33.
 *
 * Invariante: `sum(splitCents(t, n)) === t` para todo `t` e `n >= 1`.
 */
export function splitCents(totalCents: number, parts: number): number[] {
  assertSafeCents(totalCents, 'totalCents')
  if (!Number.isInteger(parts) || parts < 1) {
    throw new MoneyError(`parts deve ser um inteiro >= 1, recebido ${parts}`)
  }

  // `Math.trunc` e não `Math.floor`: para totais negativos, arredondar em
  // direção ao zero mantém o resto com o mesmo sinal do total, e a distribuição
  // abaixo continua somando certo.
  const base = Math.trunc(totalCents / parts)
  const remainder = totalCents - base * parts
  const step = remainder >= 0 ? 1 : -1
  const extras = Math.abs(remainder)

  const result: number[] = new Array<number>(parts)
  for (let i = 0; i < parts; i += 1) {
    result[i] = base + (i < extras ? step : 0)
  }
  return result
}

/** Soma valores em centavos, validando cada parcela. */
export function sumCents(values: readonly number[]): number {
  let total = 0
  for (const value of values) {
    assertSafeCents(value, 'valor')
    total += value
  }
  assertSafeCents(total, 'soma')
  return total
}

/**
 * Converte um valor digitado pelo usuário em centavos.
 *
 * Aceita as formas que aparecem num teclado brasileiro: `1234,56`, `1.234,56`,
 * `1234.56` e `1234`. Devolve `null` quando não dá para interpretar — quem
 * chama decide a mensagem de erro.
 */
export function parseCents(input: string): number | null {
  const trimmed = input.trim()
  if (trimmed === '') return null

  const negative = trimmed.startsWith('-')
  const digitsOnly = trimmed.replace(/[^\d.,]/g, '')
  if (digitsOnly === '') return null

  const lastComma = digitsOnly.lastIndexOf(',')
  const lastDot = digitsOnly.lastIndexOf('.')
  const separatorIndex = Math.max(lastComma, lastDot)

  let integerPart: string
  let fractionPart: string

  if (separatorIndex === -1) {
    integerPart = digitsOnly
    fractionPart = ''
  } else {
    const candidateFraction = digitsOnly.slice(separatorIndex + 1)
    // Um separador seguido de exatamente 3 dígitos é milhar (1.234), não decimal.
    if (candidateFraction.length === 3 && digitsOnly.length > 4) {
      integerPart = digitsOnly
      fractionPart = ''
    } else {
      integerPart = digitsOnly.slice(0, separatorIndex)
      fractionPart = candidateFraction
    }
  }

  const integerDigits = integerPart.replace(/[.,]/g, '')
  const fractionDigits = fractionPart.replace(/[.,]/g, '')

  if (fractionDigits.length > 2) return null
  if (integerDigits === '' && fractionDigits === '') return null

  const cents =
    Number(integerDigits || '0') * 100 + Number(fractionDigits.padEnd(2, '0') || '0')

  if (!Number.isSafeInteger(cents)) return null
  return negative ? -cents : cents
}

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Formata centavos como moeda brasileira: `123456` vira `R$ 1.234,56`. */
export function formatCents(cents: number): string {
  assertSafeCents(cents, 'cents')
  return BRL.format(cents / 100)
}
