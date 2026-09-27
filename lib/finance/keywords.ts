import type { EntryKind } from './types'

/**
 * Categoria pela palavra-chave. v1.0 — 2026-09-27.
 *
 * v1.1 — 2026-09-27: `matchKeyword` (a palavra que casa, sem categoria em volta) passou a ser
 * a peça comum com a conexão do extrato (`reconcile.ts`), e `suggestKeywords` alimenta o
 * campo de palavras-chave com as descrições já importadas.
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
 * A palavra-chave mais longa da lista que aparece no texto, ou `null`. v1.1 — 2026-09-27.
 *
 * Mesmas regras de `matchCategoryByKeywords`: sem acento e sem caixa, e palavra de até 3
 * letras só casa inteira. Devolve também o tamanho normalizado, que é o critério de
 * especificidade de quem compara vários candidatos.
 */
export function matchKeyword(
  text: string,
  keywords: readonly string[],
): { keyword: string; length: number } | null {
  const haystack = normalizeText(text)
  if (!haystack) return null

  let best: { keyword: string; length: number } | null = null
  for (const keyword of keywords) {
    const needle = normalizeText(keyword)
    if (!needle || !contains(haystack, needle)) continue
    if (!best || needle.length > best.length) best = { keyword, length: needle.length }
  }
  return best
}

/**
 * Sugestões para o campo de palavras-chave. v1.1 — 2026-09-27.
 *
 * `pool` são as descrições únicas dos lançamentos importados, na ordem de relevância que a
 * camada de query escolheu (mais frequentes primeiro). Fica o que contém o rascunho — sem
 * acento, sem caixa, em qualquer ponto — e ainda não foi escolhido. Com rascunho vazio, as
 * primeiras da lista: é o convite para quem não sabe o que digitar.
 */
export function suggestKeywords(
  draft: string,
  pool: readonly string[],
  chosen: readonly string[],
  limit = 8,
): string[] {
  const query = normalizeText(draft)
  const taken = new Set(chosen.map(normalizeText))
  const seen = new Set<string>()
  const result: string[] = []

  for (const item of pool) {
    const key = normalizeText(item)
    if (!key || taken.has(key) || seen.has(key)) continue
    if (query && !key.includes(query)) continue
    seen.add(key)
    result.push(item.slice(0, MAX_KEYWORD_LENGTH).trim())
    if (result.length >= limit) break
  }

  return result
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
  let best: { match: KeywordMatch; length: number } | null = null
  let tie = false

  for (const category of categories) {
    if (category.kind !== kind || category.archivedAt) continue

    // v1.1: a palavra mais longa de cada categoria; o empate só importa entre categorias.
    const found = matchKeyword(description, category.keywords)
    if (!found) continue

    if (!best || found.length > best.length) {
      best = { match: { categoryId: category.id, keyword: found.keyword }, length: found.length }
      tie = false
    } else if (found.length === best.length && category.id !== best.match.categoryId) {
      tie = true
    }
  }

  return best && !tie ? best.match : null
}
