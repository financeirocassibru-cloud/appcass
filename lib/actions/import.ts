'use server'

import { revalidatePath } from 'next/cache'
import { suggestCategoriesWithAi } from '@/lib/ai/categorize'
import { isAiConfigured } from '@/lib/ai/env'
import { currentUserId } from '@/lib/db/current-user'
import { listActiveCategories } from '@/lib/db/queries/categories'
import { suggestFromHistory, type CategoryOption, type HistoryEntry } from '@/lib/import/suggest'
import { createClient } from '@/lib/supabase/server'
import { commitImportSchema, prepareImportSchema, suggestGroupsSchema } from '@/lib/validation/import'

/**
 * Importação de extrato, do lado do servidor. v1.0 — 2026-09-27.
 *
 * O arquivo **não chega aqui**. O navegador lê o PDF/CSV, monta as linhas e manda só elas;
 * o servidor confere, sugere e grava. Três tempos, como o assistente:
 *
 *  1. `prepareImport` — leitura: o que já foi importado antes (fica de fora), o que parece
 *     já ter sido lançado à mão (vem desmarcado) e a categoria que o histórico sugere;
 *  2. `suggestImportCategories` — a IA, só para os grupos que o histórico não resolveu;
 *  3. `commitImport` — grava o que a pessoa confirmou, sem duplicar.
 */

export interface ImportSetup {
  categories: CategoryOption[]
  /** `import_key` que já existem — importadas antes, por este ou outro arquivo. */
  alreadyImported: string[]
  /** `import_key` das linhas que batem com lançamento manual (mesmo dia, tipo e valor). */
  possibleDuplicates: string[]
  /** Categoria sugerida pelo histórico, por `import_key`. */
  suggestions: Record<string, string>
  aiAvailable: boolean
  error?: string
}

/** O PostgREST do Supabase devolve no máximo 1000 linhas por pedido; aqui se pagina. */
const PAGE = 1000
const MAX_PAGES = 20

export async function prepareImport(input: unknown): Promise<ImportSetup> {
  const empty: ImportSetup = {
    categories: [],
    alreadyImported: [],
    possibleDuplicates: [],
    suggestions: {},
    aiAvailable: false,
  }

  const parsed = prepareImportSchema.safeParse(input)
  if (!parsed.success) return { ...empty, error: 'Não consegui conferir as linhas lidas.' }
  const rows = parsed.data

  const supabase = await createClient()
  const dates = rows.map((r) => r.occurredOn).sort()
  const from = dates[0] ?? ''
  const to = dates.at(-1) ?? ''

  // Tudo que já existe no período do extrato. Sem filtro de usuário: quem restringe é a RLS
  // (invariante 3) — leitura não precisa de WHERE para ser aceita.
  const existing: { import_key: string | null; occurred_on: string; kind: string; amount_cents: number }[] = []
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { data, error } = await supabase
      .from('entries')
      .select('import_key, occurred_on, kind, amount_cents')
      .gte('occurred_on', from)
      .lte('occurred_on', to)
      .order('id')
      .range(page * PAGE, page * PAGE + PAGE - 1)
    if (error) return { ...empty, error: `Não consegui ler seus lançamentos: ${error.message}` }
    existing.push(...data)
    if (data.length < PAGE) break
  }

  const imported = new Set(existing.flatMap((e) => (e.import_key ? [e.import_key] : [])))

  // Lançamento digitado no mesmo dia, mesmo tipo e mesmo valor: provável que seja o mesmo.
  // Conta como multiconjunto — dois cafés de R$ 5 à mão casam com dois do extrato, não três.
  const manual = new Map<string, number>()
  for (const e of existing) {
    if (e.import_key) continue
    const k = `${e.occurred_on}|${e.kind}|${e.amount_cents}`
    manual.set(k, (manual.get(k) ?? 0) + 1)
  }
  const possibleDuplicates: string[] = []
  for (const row of rows) {
    if (imported.has(row.importKey)) continue
    const k = `${row.occurredOn}|${row.kind}|${row.amountCents}`
    const left = manual.get(k) ?? 0
    if (left > 0) {
      manual.set(k, left - 1)
      possibleDuplicates.push(row.importKey)
    }
  }

  const [categories, historyResult] = await Promise.all([
    listActiveCategories(),
    supabase
      .from('entries')
      .select('description, kind, category_id')
      .not('category_id', 'is', null)
      .order('occurred_on', { ascending: false })
      .limit(PAGE),
  ])

  const history: HistoryEntry[] = (historyResult.data ?? []).flatMap((h) =>
    h.category_id ? [{ description: h.description, kind: h.kind, categoryId: h.category_id }] : [],
  )
  const activeIds = new Set(categories.map((c) => c.id))
  const suggested = suggestFromHistory(rows, history)
  const suggestions: Record<string, string> = {}
  rows.forEach((row, i) => {
    const id = suggested[i]
    // Categoria arquivada não volta como sugestão.
    if (id && activeIds.has(id)) suggestions[row.importKey] = id
  })

  return {
    categories: categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind })),
    alreadyImported: [...imported].filter((k) => rows.some((r) => r.importKey === k)),
    possibleDuplicates,
    suggestions,
    aiAvailable: isAiConfigured(),
  }
}

/** Sugestão da IA por grupo de contraparte. `{}` quando a IA está desligada ou falhou. */
export async function suggestImportCategories(input: unknown): Promise<Record<string, string>> {
  if (!isAiConfigured()) return {}
  const parsed = suggestGroupsSchema.safeParse(input)
  if (!parsed.success) return {}

  const categories = await listActiveCategories()
  return suggestCategoriesWithAi(
    parsed.data,
    categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind })),
  )
}

export interface CommitImportState {
  error?: string
  success?: string
  inserted?: number
  skipped?: number
}

export async function commitImport(input: unknown): Promise<CommitImportState> {
  const parsed = commitImportSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Lançamentos inválidos.' }
  }

  const userId = await currentUserId()
  const supabase = await createClient()

  // A FK de `category_id` não passa pela RLS: um id de categoria alheia seria aceito pelo
  // banco. Só fica categoria ativa da própria pessoa, e do mesmo tipo do lançamento.
  const categories = await listActiveCategories()
  const kindOf = new Map(categories.map((c) => [c.id, c.kind]))

  // A mesma chave duas vezes no mesmo envio seria uma linha a mais para o banco descartar.
  const seen = new Set<string>()
  const rows = parsed.data.flatMap((row) => {
    if (seen.has(row.importKey)) return []
    seen.add(row.importKey)
    const categoryId = row.categoryId && kindOf.get(row.categoryId) === row.kind ? row.categoryId : null
    return [
      {
        user_id: userId,
        kind: row.kind,
        amount_cents: row.amountCents,
        occurred_on: row.occurredOn,
        description: row.description,
        notes: row.notes,
        category_id: categoryId,
        // Extrato é o que já aconteceu: liquidado na própria data (constraint
        // `entries_settled_needs_date`).
        is_settled: true,
        settled_on: row.occurredOn,
        source: 'manual' as const,
        import_key: row.importKey,
      },
    ]
  })

  // `ignoreDuplicates` vira `on conflict (user_id, import_key) do nothing`: reimportar o
  // mesmo extrato não cria nada (migration 0016). O `.select` devolve só as inseridas, e é
  // por ele que se sabe quantas eram novas — sem ele, o sucesso seria silencioso mesmo que
  // nada tivesse entrado (invariante 17).
  const { data, error } = await supabase
    .from('entries')
    .upsert(rows, { onConflict: 'user_id,import_key', ignoreDuplicates: true })
    .select('id')

  if (error) return { error: `Não foi possível importar: ${error.message}` }

  const inserted = data?.length ?? 0
  const skipped = rows.length - inserted

  revalidatePath('/historico')
  revalidatePath('/analise')
  revalidatePath('/')

  const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios.replace('#', String(n)))
  const success =
    inserted === 0
      ? 'Nada novo: esses lançamentos já tinham sido importados.'
      : `${plural(inserted, '1 lançamento importado', '# lançamentos importados')}.` +
        (skipped > 0 ? ` ${plural(skipped, '1 já existia', '# já existiam')}.` : '')

  return { success, inserted, skipped }
}
