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

const BRL_COMPACT = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
})

const BRL_WHOLE = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
})

/**
 * Valor abreviado para eixo de gráfico: `123456789` vira `R$ 1,2 mi`.
 *
 * Existe porque o eixo vertical de um gráfico em celular não tem largura para
 * `R$ 1.234.567,89`. Até mil reais o número sai inteiro — `R$ 0` e não
 * `R$ 0,0`, que é o que a notação compacta produz e lê como valor truncado.
 *
 * Só para eixo e rótulo de gráfico. Onde a pessoa confere um valor,
 * `formatCents` mostra os centavos.
 */
export function formatCentsCompact(cents: number): string {
  assertSafeCents(cents, 'cents')
  const reais = cents / 100
  return Math.abs(reais) < 1000 ? BRL_WHOLE.format(reais) : BRL_COMPACT.format(reais)
}

/**
 * Acumulador de dígitos do campo de valor, no estilo de app de banco.
 *
 * O campo não guarda texto: guarda o número de centavos. Digitar `1`, `2`, `3`,
 * `4` leva o estado a 1234 centavos, exibido como R$ 12,34 — a vírgula anda
 * sozinha da direita para a esquerda, e não existe momento em que o valor
 * precise ser convertido de string, arredondado ou reinterpretado.
 *
 * É o que sustenta a invariante de dinheiro em centavos inteiros na ponta da
 * interface, onde o app antigo deixava o usuário digitar `12.34` e depois fazia
 * `parseFloat`.
 */

/** Teto de segurança: R$ 99.999.999,99. Acima disso é erro de digitação. */
const MAX_INPUT_CENTS = 9_999_999_999

/** Acrescenta um dígito à direita. Ignora entrada que não seja de 0 a 9. */
export function pushCentsDigit(cents: number, digit: string): number {
  if (!/^[0-9]$/.test(digit)) return cents

  const next = cents * 10 + Number(digit)
  // Ignora o excedente em vez de truncar: truncar mudaria o valor que o usuário
  // já vê na tela, sem ele perceber.
  return next > MAX_INPUT_CENTS ? cents : next
}

/** Remove o dígito mais à direita. Em zero, permanece em zero. */
export function popCentsDigit(cents: number): number {
  return Math.trunc(cents / 10)
}

/**
 * Estado inicial do campo a partir de um valor já existente (tela de edição).
 * Valor negativo ou fora da faixa volta a zero.
 */
export function centsFromInitial(cents: number | null | undefined): number {
  if (typeof cents !== 'number' || !Number.isInteger(cents)) return 0
  if (cents < 0 || cents > MAX_INPUT_CENTS) return 0
  return cents
}
