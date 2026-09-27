import type { EntryKind } from './types'

/**
 * Categoria pela palavra-chave. v1.0 — 2026-09-27.
 *
 * A pessoa escreve em cada categoria as palavras que a identificam ("iFood, Rappi" em
 * Alimentação), e um lançamento cujo nome contém uma delas entra ali sozinho — na
 * importação de extrato e no [+]. É regra escrita pela própria pessoa, e por isso vence o
 * palpite do histórico e o da IA.
 *
 * **Puro** (invariante 9): sem I/O, sem data. A comparação é sem acento e sem caixa, e
 * pontuação vira espaço — "IFD*IFOOD" casa com "ifood", "Açaí" com "acai".
 *
 * Duas regras para errar pouco:
 * - Palavra curta (até 3 letras) só casa como **palavra inteira**: "bar" não pode pegar
 *   "barbearia". Palavra maior casa em qualquer ponto, porque o banco cola nomes ("PAG*
 *   SUPERMERCADOXYZ") e a pessoa não vai prever cada colagem.
 * - Quando duas categorias diferentes casam, vence a palavra-chave mais longa — é a mais
 *   específica. Empate de tamanho entre categorias diferentes não decide: devolve `null`, e
 *   a linha segue para o histórico ou para a IA. Chutar entre duas regras da pessoa seria
 *   contrariar uma delas sem ela saber.
 */

/** Quantas palavras-chave uma categoria guarda. O banco confere o mesmo teto (0018). */
export const MAX_KEYWORDS = 30

/** Tamanho máximo de cada palavra-chave, em caracteres. */
export const MAX_KEYWORD_LENGTH = 40

/** Até este tamanho, a palavra-chave só casa como palavra inteira. */
const WHOLE_WORD_UP_TO = 3

/** Sem acento, minúsculas, e tudo que não é letra ou número vira um espaço só. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/**
 * A lista que vai para o banco, a partir do que a pessoa digitou ou de uma lista já
 * separada. Separa por vírgula, ponto e vírgula ou quebra de linha; tira vazias e repetidas
 * (comparando já normalizadas); corta no teto de quantidade e de tamanho.
 *
 * Guarda o texto como a pessoa escreveu ("iFood"), não o normalizado — é o que a tela
 * mostra de volta. A normalização acontece na hora de casar.
 */
export function parseKeywords(input: string | readonly string[]): string[] {
  const raw = typeof input === 'string' ? input.split(/[,;\n]/) : input
  const seen = new Set<string>()
  const result: string[] = []

  for (const item of raw) {
    const clean = item.replace(/\s+/g, ' ').trim().slice(0, MAX_KEYWORD_LENGTH).trim()
    const key = normalizeText(clean)
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(clean)
    if (result.length >= MAX_KEYWORDS) break
  }

  return result
}

export interface KeywordCategory {
  id: string
  kind: EntryKind
  keywords: readonly string[]
  /** Arquivada não recebe lançamento novo. */
  archivedAt?: string | null
}

export interface KeywordMatch {
  categoryId: string
  /** A palavra-chave que decidiu, como a pessoa a escreveu — a tela a mostra. */
  keyword: string
}

/** A palavra-chave aparece no texto normalizado? */
function contains(haystack: string, needle: string): boolean {
  if (needle.length <= WHOLE_WORD_UP_TO) return ` ${haystack} `.includes(` ${needle} `)
  return haystack.includes(needle)
}

/**
 * A categoria cuja palavra-chave aparece no nome do lançamento, ou `null`.
 *
 * Só considera categorias ativas e do mesmo tipo do lançamento — "Salário" numa categoria de
 * entrada não pode classificar uma saída chamada "adiantamento de salário".
 */
export function matchCategoryByKeywords(
  description: string,
  kind: EntryKind,
  categories: readonly KeywordCategory[],
): KeywordMatch | null {
  const text = normalizeText(description)
  if (!text) return null

  let best: { match: KeywordMatch; length: number } | null = null
  let tie = false

  for (const category of categories) {
    if (category.kind !== kind || category.archivedAt) continue

    for (const keyword of category.keywords) {
      const needle = normalizeText(keyword)
      if (!needle || !contains(text, needle)) continue

      if (!best || needle.length > best.length) {
        best = { match: { categoryId: category.id, keyword }, length: needle.length }
        tie = false
      } else if (needle.length === best.length && category.id !== best.match.categoryId) {
        tie = true
      }
    }
  }

  return best && !tie ? best.match : null
}
