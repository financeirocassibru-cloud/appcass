'use server'

import { revalidatePath } from 'next/cache'
import { isAiConfigured } from '@/lib/ai/env'
import { currentUserId } from '@/lib/db/current-user'
import { listActiveCategories } from '@/lib/db/queries/categories'
import type { EntryKind } from '@/lib/db/types'
import type { RecategorizeTarget } from '@/lib/import/recategorize'
import type { CategoryOption } from '@/lib/import/suggest'
import { createClient } from '@/lib/supabase/server'
import {
  applyCategoriesSchema,
  createEntrySchema,
  deleteEntriesSchema,
  entryIdSchema,
  entrySelectionSchema,
  MAX_RECATEGORIZE,
  toggleSettledSchema,
  updateEntrySchema,
} from '@/lib/validation/entries'

/*
 * Escrita de lançamentos. v1.3 — 2026-09-27.
 *
 * v1.3: `prepareRecategorize` e `applyCategories`, o "Categorizar" da seleção de "Todos os
 * lançamentos" — palavra-chave e IA aplicadas a lançamentos que já existem.
 */

export interface EntryActionState {
  error?: string
  success?: string
}

/**
 * Rotas que exibem lançamentos e precisam ser revalidadas depois de escrever.
 *
 * v1.1 — 2026-09-26: `/analise` entrou na lista. Ela sempre exibiu lançamentos, e até aqui só
 * não ficava velha por ser `force-dynamic` — o que é sorte, não garantia. Agora que dá para
 * criar e editar lançamento de dentro dela (pela tela cheia do gráfico), a revalidação é o que
 * faz a curva mudar depois de salvar.
 */
function revalidateEntryViews(): void {
  revalidatePath('/historico')
  revalidatePath('/analise')
  revalidatePath('/')
  // v1.2 — 2026-09-27: "Ver todos" também mostra lançamentos, e agora exclui em lote.
  revalidatePath('/novo/lancamentos')
}

export async function createEntry(
  _prev: EntryActionState,
  formData: FormData,
): Promise<EntryActionState> {
  const parsed = createEntrySchema.safeParse({
    kind: formData.get('kind'),
    amountCents: formData.get('amountCents'),
    occurredOn: formData.get('occurredOn'),
    description: formData.get('description'),
    categoryId: formData.get('categoryId') ?? '',
    notes: formData.get('notes') ?? '',
    isSettled: formData.get('isSettled'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  const userId = await currentUserId()
  const supabase = await createClient()

  const { error } = await supabase.from('entries').insert({
    // A RLS exige `user_id` no `with check`; a policy restringe a linha, ela não
    // preenche o dono.
    user_id: userId,
    kind: parsed.data.kind,
    amount_cents: parsed.data.amountCents,
    occurred_on: parsed.data.occurredOn,
    description: parsed.data.description,
    category_id: parsed.data.categoryId,
    notes: parsed.data.notes ?? null,
    is_settled: parsed.data.isSettled,
    // A constraint `entries_settled_needs_date` exige a data quando liquidado.
    settled_on: parsed.data.isSettled ? parsed.data.occurredOn : null,
    source: 'manual',
  })

  if (error) {
    return { error: `Não foi possível salvar: ${error.message}` }
  }

  revalidateEntryViews()
  return { success: 'Lançamento salvo.' }
}

export async function updateEntry(
  _prev: EntryActionState,
  formData: FormData,
): Promise<EntryActionState> {
  const parsed = updateEntrySchema.safeParse({
    id: formData.get('id'),
    kind: formData.get('kind'),
    amountCents: formData.get('amountCents'),
    occurredOn: formData.get('occurredOn'),
    description: formData.get('description'),
    categoryId: formData.get('categoryId') ?? '',
    notes: formData.get('notes') ?? '',
    isSettled: formData.get('isSettled'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  const supabase = await createClient()

  // `.select()` e checagem do resultado: o supabase-js devolve sucesso quando o
  // update não casa nenhuma linha (invariante 17). Aqui isso aconteceria se o id
  // não existisse ou pertencesse a outra pessoa — a RLS filtra em silêncio.
  const { data, error } = await supabase
    .from('entries')
    .update({
      kind: parsed.data.kind,
      amount_cents: parsed.data.amountCents,
      occurred_on: parsed.data.occurredOn,
      description: parsed.data.description,
      category_id: parsed.data.categoryId,
      notes: parsed.data.notes ?? null,
      is_settled: parsed.data.isSettled,
      settled_on: parsed.data.isSettled ? parsed.data.occurredOn : null,
    })
    .eq('id', parsed.data.id)
    .select('id')

  if (error) return { error: `Não foi possível salvar: ${error.message}` }
  if (!data || data.length === 0) return { error: 'Lançamento não encontrado.' }

  revalidateEntryViews()
  return { success: 'Lançamento atualizado.' }
}

export async function deleteEntry(
  _prev: EntryActionState,
  formData: FormData,
): Promise<EntryActionState> {
  const parsed = entryIdSchema.safeParse({ id: formData.get('id') })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Lançamento inválido' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('entries')
    .delete()
    .eq('id', parsed.data.id)
    .select('id')

  if (error) return { error: `Não foi possível excluir: ${error.message}` }
  if (!data || data.length === 0) return { error: 'Lançamento não encontrado.' }

  revalidateEntryViews()
  return { success: 'Lançamento excluído.' }
}

/** Alterna pago/pendente. É a ação mais usada do extrato, então tem a sua própria. */
export async function toggleSettled(
  _prev: EntryActionState,
  formData: FormData,
): Promise<EntryActionState> {
  const parsed = toggleSettledSchema.safeParse({
    id: formData.get('id'),
    isSettled: formData.get('isSettled'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  const supabase = await createClient()

  // A data de liquidação sai da própria data de competência do lançamento, e não
  // de "hoje": marcar em atraso uma conta de mês passado não deve reescrever
  // quando ela aconteceu.
  const { data: current, error: readError } = await supabase
    .from('entries')
    .select('occurred_on')
    .eq('id', parsed.data.id)
    .maybeSingle()

  if (readError) return { error: `Não foi possível atualizar: ${readError.message}` }
  if (!current) return { error: 'Lançamento não encontrado.' }

  const { data, error } = await supabase
    .from('entries')
    .update({
      is_settled: parsed.data.isSettled,
      settled_on: parsed.data.isSettled ? current.occurred_on : null,
    })
    .eq('id', parsed.data.id)
    .select('id')

  if (error) return { error: `Não foi possível atualizar: ${error.message}` }
  if (!data || data.length === 0) return { error: 'Lançamento não encontrado.' }

  revalidateEntryViews()
  return {}
}

export interface DeleteEntriesState {
  error?: string
  success?: string
  deleted?: number
}

/**
 * Exclui vários lançamentos de uma vez — os marcados e/ou importações inteiras. v1.0 —
 * 2026-09-27.
 *
 * Só `source = 'manual'` (avulsos e importados), que é o que "Ver todos" lista: parcela e
 * ocorrência de conta fixa pertencem a um cadastro e têm a exclusão dele. O filtro vai na
 * query, e não só na tela, para um id forjado de parcela não passar.
 *
 * Cada exclusão leva filtro (o PostgREST recusa escrita sem WHERE — invariante 3) e
 * `.select('id')`, e nada apagado é erro (invariante 17): a RLS descarta em silêncio o que
 * não é da pessoa, e sem a contagem o "excluído" seria mentira.
 *
 * Excluir um importado libera a `import_key` dele — importar o mesmo extrato de novo volta a
 * trazê-lo. É justamente o que se quer ao desfazer uma importação ruim.
 */
export async function deleteEntries(input: unknown): Promise<DeleteEntriesState> {
  const parsed = deleteEntriesSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Seleção inválida' }
  }

  const { ids, importBatchIds } = parsed.data
  const supabase = await createClient()
  let deleted = 0

  if (importBatchIds.length > 0) {
    const { data, error } = await supabase
      .from('entries')
      .delete()
      .eq('source', 'manual')
      .in('import_batch_id', importBatchIds)
      .select('id')
    if (error) return { error: `Não foi possível excluir: ${error.message}` }
    deleted += data?.length ?? 0
  }

  if (ids.length > 0) {
    const { data, error } = await supabase
      .from('entries')
      .delete()
      .eq('source', 'manual')
      .in('id', ids)
      .select('id')
    if (error) return { error: `Não foi possível excluir: ${error.message}` }
    deleted += data?.length ?? 0
  }

  if (deleted === 0) return { error: 'Nenhum lançamento encontrado para excluir.' }

  revalidateEntryViews()
  return {
    deleted,
    success: deleted === 1 ? '1 lançamento excluído.' : `${deleted} lançamentos excluídos.`,
  }
}

export interface RecategorizeSetup {
  error?: string
  targets: RecategorizeTarget[]
  categories: CategoryOption[]
  aiAvailable: boolean
}

/**
 * O que "Categorizar" precisa para montar a prévia. v1.0 — 2026-09-27.
 *
 * Lê do banco a seleção inteira — os marcados e as importações inteiras, inclusive as linhas
 * que não estão na página —, com a categoria atual de cada um, e as categorias ativas com as
 * palavras-chave. Não grava nada: a proposta é calculada no aparelho
 * (`lib/import/recategorize.ts`) e só vira escrita em `applyCategories`, depois da prévia.
 *
 * Só `source = 'manual'`, como a exclusão em lote: parcela e ocorrência de conta fixa herdam
 * a categoria do cadastro delas.
 */
export async function prepareRecategorize(input: unknown): Promise<RecategorizeSetup> {
  const empty: RecategorizeSetup = { targets: [], categories: [], aiAvailable: false }
  const parsed = entrySelectionSchema.safeParse(input)
  if (!parsed.success) {
    return { ...empty, error: parsed.error.issues[0]?.message ?? 'Seleção inválida' }
  }

  const { ids, importBatchIds } = parsed.data
  const supabase = await createClient()
  type Row = { id: string; description: string; kind: EntryKind; category_id: string | null }
  const rows = new Map<string, Row>()

  if (ids.length > 0) {
    const { data, error } = await supabase
      .from('entries')
      .select('id, description, kind, category_id')
      .eq('source', 'manual')
      .in('id', ids)
    if (error) return { ...empty, error: `Não consegui ler os lançamentos: ${error.message}` }
    for (const row of data) rows.set(row.id, row)
  }

  // O Supabase devolve no máximo 1000 linhas por pedido; importações inteiras passam disso.
  if (importBatchIds.length > 0) {
    for (let page = 0; page * 1000 < MAX_RECATEGORIZE + 1000; page += 1) {
      const { data, error } = await supabase
        .from('entries')
        .select('id, description, kind, category_id')
        .eq('source', 'manual')
        .in('import_batch_id', importBatchIds)
        .order('id')
        .range(page * 1000, page * 1000 + 999)
      if (error) return { ...empty, error: `Não consegui ler os lançamentos: ${error.message}` }
      for (const row of data) rows.set(row.id, row)
      if (data.length < 1000) break
    }
  }

  if (rows.size === 0) return { ...empty, error: 'Nenhum lançamento encontrado na seleção.' }
  if (rows.size > MAX_RECATEGORIZE) {
    return { ...empty, error: `Selecione no máximo ${MAX_RECATEGORIZE} lançamentos para categorizar.` }
  }

  const categories = await listActiveCategories()
  return {
    targets: [...rows.values()].map((row) => ({
      id: row.id,
      description: row.description,
      kind: row.kind,
      categoryId: row.category_id,
    })),
    categories: categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind, keywords: c.keywords })),
    aiAvailable: isAiConfigured(),
  }
}

export interface ApplyCategoriesState {
  error?: string
  success?: string
  updated?: number
}

/**
 * Grava o que a prévia de "Categorizar" confirmou. v1.0 — 2026-09-27.
 *
 * A FK de `category_id` não passa pela RLS — um id de categoria alheia seria aceito pelo
 * banco —, então só fica categoria ativa da própria pessoa **e do mesmo tipo** do lançamento,
 * o mesmo guarda de `commitImport`. O tipo vem do banco, relido aqui, e não do cliente.
 *
 * Uma escrita por categoria, com filtro (invariante 3) e `.select('id')`; nada atualizado é
 * erro (invariante 17).
 */
export async function applyCategories(input: unknown): Promise<ApplyCategoriesState> {
  const parsed = applyCategoriesSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Categorias inválidas' }
  }

  const supabase = await createClient()
  const ids = [...new Set(parsed.data.items.map((item) => item.id))]

  const kindOfEntry = new Map<string, EntryKind>()
  for (let start = 0; start < ids.length; start += 500) {
    const { data, error } = await supabase
      .from('entries')
      .select('id, kind')
      .eq('source', 'manual')
      .in('id', ids.slice(start, start + 500))
    if (error) return { error: `Não consegui ler os lançamentos: ${error.message}` }
    for (const row of data) kindOfEntry.set(row.id, row.kind)
  }

  const categories = await listActiveCategories()
  const kindOfCategory = new Map(categories.map((c) => [c.id, c.kind]))

  const byCategory = new Map<string, string[]>()
  for (const item of parsed.data.items) {
    const kind = kindOfEntry.get(item.id)
    if (!kind || kindOfCategory.get(item.categoryId) !== kind) continue
    const list = byCategory.get(item.categoryId) ?? []
    list.push(item.id)
    byCategory.set(item.categoryId, list)
  }

  let updated = 0
  for (const [categoryId, entryIds] of byCategory) {
    for (let start = 0; start < entryIds.length; start += 500) {
      const { data, error } = await supabase
        .from('entries')
        .update({ category_id: categoryId })
        .eq('source', 'manual')
        .in('id', entryIds.slice(start, start + 500))
        .select('id')
      if (error) return { error: `Não foi possível categorizar: ${error.message}` }
      updated += data?.length ?? 0
    }
  }

  if (updated === 0) return { error: 'Nenhum lançamento foi categorizado.' }

  revalidateEntryViews()
  return {
    updated,
    success: updated === 1 ? '1 lançamento categorizado.' : `${updated} lançamentos categorizados.`,
  }
}
