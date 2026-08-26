import { createHash, randomBytes } from 'node:crypto'

/**
 * Códigos de convite.
 *
 * O admin gera um código na tela de ajustes e repassa por fora — nenhum e-mail
 * é enviado. O banco guarda apenas o sha256; o código em claro aparece uma
 * única vez, na resposta da geração.
 */

/**
 * Alfabeto sem os caracteres que se confundem ao ler em voz alta ou copiar de
 * uma tela: 0/O, 1/I/L, 2/Z, 5/S, 8/B. O código é ditado por WhatsApp ou
 * pessoalmente, então isso importa mais que o alfabeto ser completo.
 */
const ALPHABET = 'ACDEFGHJKMNPQRTUVWXY34679'

/** 5 grupos de 5 = 25 caracteres. log2(25^25) ≈ 116 bits. */
const GROUPS = 5
const GROUP_SIZE = 5
const CODE_LENGTH = GROUPS * GROUP_SIZE

/**
 * Gera um código aleatório no formato `ABCDE-FGHJK-...`.
 *
 * Usa rejeição de amostra em vez de `% ALPHABET.length`: o módulo enviesaria
 * as primeiras letras do alfabeto, já que 256 não é múltiplo de 25.
 */
export function generateInviteCode(): string {
  const limit = Math.floor(256 / ALPHABET.length) * ALPHABET.length
  const chars: string[] = []

  while (chars.length < CODE_LENGTH) {
    for (const byte of randomBytes(CODE_LENGTH)) {
      if (byte >= limit) continue
      chars.push(ALPHABET[byte % ALPHABET.length]!)
      if (chars.length === CODE_LENGTH) break
    }
  }

  const groups: string[] = []
  for (let i = 0; i < GROUPS; i += 1) {
    groups.push(chars.slice(i * GROUP_SIZE, (i + 1) * GROUP_SIZE).join(''))
  }
  return groups.join('-')
}

/**
 * Normaliza o que o usuário digitou: remove hífens e espaços, e sobe para
 * maiúsculas. Quem recebe o código por mensagem cola com formatação variada.
 */
export function normalizeInviteCode(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase()
}

/**
 * sha256 do código normalizado.
 *
 * Determinístico de propósito: o resgate precisa achar o convite PELO código,
 * e um bcrypt com salt obrigaria a varrer a tabela inteira. Com ~116 bits de
 * entropia, pré-computar não leva a lugar nenhum.
 */
export function hashInviteCode(code: string): string {
  return createHash('sha256').update(normalizeInviteCode(code)).digest('hex')
}

/** `true` se a string tem o formato de um código, antes de ir ao banco. */
export function isWellFormedInviteCode(input: string): boolean {
  const normalized = normalizeInviteCode(input)
  if (normalized.length !== CODE_LENGTH) return false
  for (const char of normalized) {
    if (!ALPHABET.includes(char)) return false
  }
  return true
}

/** Prazo padrão de validade de um convite novo. */
export const DEFAULT_EXPIRY_DAYS = 7
export const MAX_EXPIRY_DAYS = 90

export function expiryFromNow(days: number, now: Date = new Date()): Date {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
}
