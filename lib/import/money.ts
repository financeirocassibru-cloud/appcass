import { parseCents } from '@/lib/finance/money'

/**
 * Valores monetários como os extratos escrevem. v1.0 — 2026-09-27.
 *
 * Cada banco escreve o sinal num lugar: `-4.69`, `- 6.327,48`, `R$ -1,00`, `(1,00)`,
 * `1.234,56 D`, `1.234,56-`. Aqui o sinal é separado primeiro e o número vai inteiro para
 * `parseCents`, que já é o conversor do app — nenhum ponto do caminho usa `parseFloat`
 * (invariante 1).
 */

export interface StatementAmount {
  /** Com sinal quando o texto trazia sinal; positivo quando não trazia. */
  cents: number
  /** `true` se o texto dizia explicitamente se é entrada ou saída. */
  explicitSign: boolean
}

/** Número com duas casas decimais, em qualquer das duas convenções, com ou sem milhar. */
const STRICT_NUMBER =
  '\\d{1,3}(?:[.\\s]\\d{3})+,\\d{2}|\\d+,\\d{2}|\\d{1,3}(?:,\\d{3})+\\.\\d{2}|\\d+\\.\\d{2}'

/** CSV costuma ter valor sem casas (`-50`) ou com uma só (`-4.5`). No PDF isso seria ruído. */
const LENIENT_NUMBER = `${STRICT_NUMBER}|\\d{1,3}(?:\\.\\d{3})+|\\d+(?:[.,]\\d)?`

function amountRegex(numberPattern: string): RegExp {
  return new RegExp(
    `^(?<open>\\()?\\s*(?<pre>[-+])?\\s*(?:R\\$|BRL)?\\s*(?<pre2>[-+])?\\s*(?<num>${numberPattern})\\s*(?<suf>[-+]|[DC](?![a-z]))?\\s*(?<close>\\))?$`,
    'i',
  )
}

const STRICT_RE = amountRegex(STRICT_NUMBER)
const LENIENT_RE = amountRegex(LENIENT_NUMBER)

/**
 * Lê um valor de extrato. Devolve `null` se o texto não é (só) um valor.
 *
 * `lenient` aceita inteiros e uma casa decimal — certo numa coluna que o cabeçalho já disse
 * ser "Valor", errado no meio do texto de um PDF, onde "2026" ou "0341" não são dinheiro.
 */
export function parseStatementAmount(
  raw: string,
  { lenient = false }: { lenient?: boolean } = {},
): StatementAmount | null {
  const text = raw.replace(/[−–]/g, '-').replace(/ /g, ' ').trim()
  if (text === '') return null

  const match = (lenient ? LENIENT_RE : STRICT_RE).exec(text)
  if (!match?.groups) return null

  const { open, close, pre, pre2, suf } = match.groups
  const num = match.groups.num ?? ''
  if (Boolean(open) !== Boolean(close)) return null

  const unsigned = parseCents(num.replace(/\s/g, ''))
  if (unsigned === null || unsigned < 0) return null

  const marks = [pre, pre2, suf].filter((m): m is string => Boolean(m)).map((m) => m.toUpperCase())
  const negative = Boolean(open) || marks.includes('-') || marks.includes('D')
  const positive = marks.includes('+') || marks.includes('C')

  return {
    cents: negative ? -unsigned : unsigned,
    explicitSign: negative || positive,
  }
}

/** Atalho: o texto é um valor de extrato no formato estrito? */
export function looksLikeAmount(text: string): boolean {
  return parseStatementAmount(text) !== null
}
