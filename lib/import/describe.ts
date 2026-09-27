import { fold } from './dates'

/**
 * Da linha do banco para uma descrição que se lê de relance. v1.0 — 2026-09-27.
 *
 * O banco escreve "Transferência enviada pelo Pix - Cassiane Fonseca - •••.423.857-•• - NU
 * PAGAMENTOS - IP (0260) Agência: 1 Conta: 40913615-0". Isso vai inteiro para Observação; a
 * descrição fica "Pix para Cassiane Fonseca". As regras olham o **sentido** das palavras,
 * não a posição de colunas, e caem para "primeiro trecho · segundo trecho" quando nenhuma
 * reconhece o texto — um banco novo nunca fica sem descrição.
 */

export const MAX_DESCRIPTION = 120
export const MAX_NOTES = 500

/** Espaços repetidos e espaços especiais viram um espaço só. */
export function squash(text: string): string {
  return text.replace(/[\s ]+/g, ' ').trim()
}

/** Os trechos que o banco separa com " - ". Hífen colado (CPF, conta) não separa. */
export function segments(original: string): string[] {
  return squash(original)
    .split(/\s+-\s+/)
    .map((s) => s.trim())
    .filter((s) => s !== '')
}

const SMALL_WORDS = new Set(['da', 'de', 'do', 'das', 'dos', 'e', 'di', 'du'])

/** "MARIA DAS GRACAS" → "Maria das Gracas". Só mexe em nome todo em maiúsculas. */
export function tidyName(name: string): string {
  const clean = squash(name)
  const letters = clean.replace(/[^\p{L}]/gu, '')
  if (letters.length < 4 || letters !== letters.toUpperCase()) return clean

  return clean
    .toLowerCase()
    .split(' ')
    .map((word, index) =>
      index > 0 && SMALL_WORDS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(' ')
}

/** Trecho que é só documento, banco ou conta — nunca serve de nome. */
function isNoise(segment: string): boolean {
  const f = fold(segment)
  return (
    // Documento mascarado ou número longo. "99" (a empresa de corrida) não é ruído.
    (/^[•*\d.\-/ ]+$/.test(segment) && (segment.length >= 6 || /[•/]/.test(segment))) ||
    /agencia|conta:|\(\d{3,4}\)/.test(f)
  )
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max - 1).trimEnd()}…`
}

/** Tira do nome o que é documento colado (MEI: "54 628 471 Fulano"). */
function nameOf(segment: string | undefined): string | null {
  if (!segment || isNoise(segment)) return null
  const withoutDocs = segment.replace(/^\d[\d .]*\s+(?=\p{L})/u, '').replace(/\s+\d{8,}$/, '')
  const name = tidyName(withoutDocs)
  return name === '' ? null : name
}

interface Rule {
  test: RegExp
  build: (rest: string[]) => string | null
}

const RULES: Rule[] = [
  {
    test: /^(transferencia enviada pelo pix|pix enviado|envio de pix|pix - enviado)/,
    build: (rest) => (nameOf(rest[0]) ? `Pix para ${nameOf(rest[0])}` : 'Pix enviado'),
  },
  {
    test: /^(transferencia recebida pelo pix|pix recebido|recebimento de pix)/,
    build: (rest) => (nameOf(rest[0]) ? `Pix de ${nameOf(rest[0])}` : 'Pix recebido'),
  },
  {
    test: /^(transferencia enviada|ted enviada|doc enviado|transferencia para)/,
    build: (rest) => (nameOf(rest[0]) ? `Transferência para ${nameOf(rest[0])}` : null),
  },
  {
    test: /^(transferencia recebida|ted recebida|doc recebido)/,
    build: (rest) => (nameOf(rest[0]) ? `Transferência de ${nameOf(rest[0])}` : null),
  },
  {
    test: /^valor adicionado na conta por cartao de credito/,
    build: () => 'Pix no crédito (valor adicionado)',
  },
  {
    test: /^pagamento de boleto/,
    build: (rest) => (rest[0] ? `Boleto · ${tidyName(rest[0])}` : 'Pagamento de boleto'),
  },
]

/** "99* POP 04Set 08h37min" → "99* POP": dia e hora da corrida não são o nome do lugar. */
function withoutTimestamp(text: string): string {
  return squash(
    text
      .replace(/\b\d{1,2}(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\b/gi, ' ')
      .replace(/\b\d{1,2}h\d{2}(min)?\b/gi, ' '),
  )
}

/** A descrição curta. Nunca vazia: o banco sempre escreve alguma coisa. */
export function summarize(original: string): string {
  const parts = segments(original)
  const [head, ...rest] = parts
  if (!head) return 'Lançamento importado'

  const foldedHead = fold(head)

  if (/^estorno$/.test(foldedHead) && rest.length > 0) {
    return truncate(`Estorno: ${summarize(rest.join(' - '))}`, MAX_DESCRIPTION)
  }

  for (const rule of RULES) {
    if (!rule.test.test(foldedHead)) continue
    const built = rule.build(rest)
    if (built) return truncate(built, MAX_DESCRIPTION)
  }

  const second = rest.find((segment) => !isNoise(segment))
  const merchant = second ? withoutTimestamp(tidyName(second)) : ''
  return truncate(merchant ? `${head} · ${merchant}` : head, MAX_DESCRIPTION)
}

/**
 * Chave para reconhecer "o mesmo lugar" em linhas diferentes.
 *
 * Sai da descrição curta, sem acento, sem pontuação e sem os pedaços de data e hora que
 * alguns estabelecimentos põem no nome ("99* POP 04Set 08h37min" → "99 pop"). É ela que
 * leva uma categoria escolhida para todas as linhas iguais, e que casa com o histórico.
 */
export function counterpartyKey(description: string): string {
  return fold(description)
    .replace(/\b\d{1,2}(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\b/g, ' ')
    .replace(/\b\d{1,2}h\d{0,2}(min)?\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * A parte "de quem" da descrição, para casar com lançamento manual antigo: "Pix para
 * Cassiane Fonseca" → "cassiane fonseca"; "Compra no débito via NuPay · iFood" → "ifood".
 */
export function counterpartyTail(description: string): string {
  const afterDot = description.includes('·') ? description.slice(description.lastIndexOf('·') + 1) : null
  const afterPrep = /^(Pix|Transferência) (para|de) (.+)$/.exec(description)?.[3] ?? null
  return counterpartyKey(afterPrep ?? afterDot ?? description)
}

/** O texto original para Observação, dentro do limite da coluna. */
export function notesFrom(original: string): string {
  return truncate(squash(original), MAX_NOTES)
}
