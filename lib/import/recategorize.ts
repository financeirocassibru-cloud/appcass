import type { EntryKind } from '@/lib/finance/types'
import { matchCategoryByKeywords, type KeywordCategory } from '@/lib/finance/keywords'
import { counterpartyKey } from './describe'
import type { SuggestGroup } from './suggest'

/**
 * Categorizar de novo lançamentos que já existem. v1.0 — 2026-09-27.
 *
 * É o que a seleção de "Todos os lançamentos" faz com o botão "Categorizar": as mesmas duas
 * fontes da importação — a palavra-chave da categoria e a IA —, aplicadas depois do fato, a
 * uma importação antiga ou ao que foi lançado antes de a palavra-chave existir.
 *
 * Puro, como o resto de `lib/import/`: recebe as linhas e as categorias, devolve propostas.
 * Quem lê do banco e quem grava são as Server Actions; quem decide o que grava é a pessoa, na
 * prévia.
 *
 * `overwrite` é o interruptor "Trocar também os que já têm categoria", desligado por padrão:
 * sem ele, lançamento que já tem categoria nem entra na conta — nem na palavra-chave, nem no
 * pedido à IA, que assim não gasta cota com o que ninguém pediu para mudar.
 */

export interface RecategorizeTarget {
  id: string
  description: string
  kind: EntryKind
  categoryId: string | null
}

export interface Proposal {
  id: string
  categoryId: string
  /** De onde veio: a palavra-chave que casou, ou a IA. */
  source: { type: 'keyword'; keyword: string } | { type: 'ai' }
}

/** As linhas que podem receber categoria, segundo o interruptor. */
export function eligibleTargets(
  targets: readonly RecategorizeTarget[],
  overwrite: boolean,
): RecategorizeTarget[] {
  return targets.filter((t) => overwrite || t.categoryId === null)
}

/** Proposta por palavra-chave para cada linha elegível que casar com alguma. */
export function keywordProposals(
  targets: readonly RecategorizeTarget[],
  categories: readonly KeywordCategory[],
  overwrite: boolean,
): Proposal[] {
  const proposals: Proposal[] = []
  for (const target of eligibleTargets(targets, overwrite)) {
    const match = matchCategoryByKeywords(target.description, target.kind, categories)
    if (match) {
      proposals.push({
        id: target.id,
        categoryId: match.categoryId,
        source: { type: 'keyword', keyword: match.keyword },
      })
    }
  }
  return diffProposals(targets, proposals)
}

/**
 * Os grupos que vão para a IA: um por contraparte e tipo, como na importação — "iFood" em 40
 * linhas é uma pergunta só. `idsByKey` leva a resposta de volta a cada linha do grupo.
 */
export function aiGroups(
  targets: readonly RecategorizeTarget[],
  overwrite: boolean,
): { groups: SuggestGroup[]; idsByKey: Map<string, string[]> } {
  const groups: SuggestGroup[] = []
  const idsByKey = new Map<string, string[]>()
  for (const target of eligibleTargets(targets, overwrite)) {
    const key = `${target.kind}:${counterpartyKey(target.description)}`
    const ids = idsByKey.get(key)
    if (ids) {
      ids.push(target.id)
      continue
    }
    idsByKey.set(key, [target.id])
    groups.push({ key, description: target.description, kind: target.kind })
  }
  return { groups, idsByKey }
}

/** A resposta da IA (`chave → categoria`) virada em propostas por linha. */
export function aiProposals(
  targets: readonly RecategorizeTarget[],
  idsByKey: ReadonlyMap<string, readonly string[]>,
  found: Readonly<Record<string, string>>,
): Proposal[] {
  const proposals: Proposal[] = []
  for (const [key, categoryId] of Object.entries(found)) {
    for (const id of idsByKey.get(key) ?? []) {
      proposals.push({ id, categoryId, source: { type: 'ai' } })
    }
  }
  return diffProposals(targets, proposals)
}

/** Fora a proposta que não muda nada: sugerir a categoria que a linha já tem é ruído. */
export function diffProposals(
  targets: readonly RecategorizeTarget[],
  proposals: readonly Proposal[],
): Proposal[] {
  const current = new Map(targets.map((t) => [t.id, t.categoryId]))
  return proposals.filter((p) => current.has(p.id) && current.get(p.id) !== p.categoryId)
}
