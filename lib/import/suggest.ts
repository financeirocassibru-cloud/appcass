import { counterpartyKey, counterpartyTail } from './describe'
import type { EntryKind } from './types'

/**
 * Categoria sugerida a partir do que a pessoa já fez. v1.0 — 2026-09-27.
 *
 * Se "Pix para Cassiane Fonseca" já foi categorizado antes, a mesma categoria volta. Casa de
 * dois jeitos: pela chave da descrição inteira (lançamento importado antes) e pela parte
 * "de quem" (lançamento manual escrito "iFood" casa com "Compra no débito via NuPay · iFood").
 * Vale a categoria mais frequente, e só dentro do mesmo tipo — gasto nunca herda categoria de
 * receita.
 *
 * O que sobrar sem sugestão vai para a IA, se ela estiver ligada (`lib/actions/import.ts`).
 */

export interface HistoryEntry {
  description: string
  kind: EntryKind
  categoryId: string
}

export interface SuggestTarget {
  description: string
  kind: EntryKind
}

type Tally = Map<string, Map<string, number>>

function add(tally: Tally, key: string, categoryId: string): void {
  if (key === '') return
  const counts = tally.get(key) ?? new Map<string, number>()
  counts.set(categoryId, (counts.get(categoryId) ?? 0) + 1)
  tally.set(key, counts)
}

function top(counts: Map<string, number> | undefined): string | null {
  if (!counts) return null
  let best: string | null = null
  let bestCount = 0
  for (const [id, count] of counts) {
    if (count > bestCount) {
      best = id
      bestCount = count
    }
  }
  return best
}

/** Uma sugestão (ou `null`) para cada alvo, na mesma ordem. */
export function suggestFromHistory(
  targets: readonly SuggestTarget[],
  history: readonly HistoryEntry[],
): (string | null)[] {
  const byKey: Tally = new Map()
  const byTail: Tally = new Map()

  for (const entry of history) {
    add(byKey, `${entry.kind}:${counterpartyKey(entry.description)}`, entry.categoryId)
    add(byTail, `${entry.kind}:${counterpartyTail(entry.description)}`, entry.categoryId)
  }

  return targets.map((target) => {
    const key = `${target.kind}:${counterpartyKey(target.description)}`
    const tail = `${target.kind}:${counterpartyTail(target.description)}`
    // A parte "de quem" só vale se tiver corpo: "99" sozinho casaria com meio mundo.
    const tailUsable = counterpartyTail(target.description).length >= 3
    return top(byKey.get(key)) ?? (tailUsable ? (top(byKey.get(tail)) ?? top(byTail.get(tail))) : null)
  })
}

export interface CategoryOption {
  id: string
  name: string
  kind: EntryKind
}

export interface SuggestGroup {
  key: string
  description: string
  kind: EntryKind
}

/**
 * Lê a resposta da IA para as categorias. Puro, para ser testado sem rede.
 *
 * O modelo pode inventar id, trocar o tipo ou responder por chave que ninguém perguntou:
 * nada disso passa. Só fica o par cuja chave foi pedida e cuja categoria existe, é da
 * pessoa e é do mesmo tipo (gasto × receita) do grupo.
 */
export function readCategorySuggestions(
  raw: unknown,
  groups: readonly SuggestGroup[],
  categories: readonly CategoryOption[],
): Record<string, string> {
  const out: Record<string, string> = {}
  if (typeof raw !== 'object' || raw === null) return out
  const items = (raw as { items?: unknown }).items
  if (!Array.isArray(items)) return out

  const kindOfGroup = new Map(groups.map((g) => [g.key, g.kind]))
  const kindOfCategory = new Map(categories.map((c) => [c.id, c.kind]))

  for (const item of items) {
    if (typeof item !== 'object' || item === null) continue
    const { key, category_id: categoryId } = item as { key?: unknown; category_id?: unknown }
    if (typeof key !== 'string' || typeof categoryId !== 'string') continue
    const groupKind = kindOfGroup.get(key)
    if (groupKind && kindOfCategory.get(categoryId) === groupKind) out[key] = categoryId
  }
  return out
}
