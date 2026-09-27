import type { EntryKind } from '@/lib/db/types'
import type { ISODate } from '@/lib/finance/date'
import type { RecurrenceFrequency } from '@/lib/finance/types'
import { mergeByCreatedAt, parseFeedCursor, type FeedItemBase } from '@/lib/feed'
import { createClient } from '@/lib/supabase/server'
import type { EntryWithCategory } from './entries'

/**
 * "Ver todos" (antes "Ver lançamentos"): o que foi cadastrado, pela data de criação.
 * v1.1 — 2026-09-27.
 *
 * v1.1: o lançamento traz o `import_batch_id` (migration 0018), e `listImportBatches` conta
 * cada importação que aparece na página — é o que permite "selecionar todos desta
 * importação" mesmo quando ela passa de uma página.
 *
 * v1.2 — 2026-09-27: o lançamento traz `keywords` (migration 0019), que a edição mostra.
 *
 * v1.3 — 2026-09-27 (Fase 13): e de onde veio o dinheiro (`credit_account_id` e a dívida,
 * migration 0021), para a edição não soltar a compra do cartão.
 *
 * Três leituras por `created_at desc`, cada uma com o mesmo limite, intercaladas por
 * `mergeByCreatedAt` (`lib/feed.ts`). Pedir `limit` de cada uma e cortar depois é o que
 * garante as `limit` mais recentes do conjunto: nenhuma das três pode contribuir com mais do
 * que isso.
 *
 * De `entries`, só `source = 'manual'` (avulsos e importados). Parcela e ocorrência paga de
 * conta fixa são geradas por um cadastro que já aparece aqui — o plano e a regra —, e listar as
 * 12 parcelas de uma compra afogaria a compra.
 *
 * Paginação por cursor (`before`), não por página: um lançamento criado enquanto a pessoa
 * rola deslocaria tudo numa paginação por offset.
 */

const ENTRY_COLUMNS = `
  id, kind, occurred_on, description, amount_cents, notes,
  is_settled, settled_on, source, source_id, occurrence_key,
  installment_number, installment_total, created_at, import_batch_id, keywords,
  credit_account_id, charge_first_due_on, charge_count, interest_cents,
  category_id, categories ( id, name, color, icon )
` as const

export interface FeedEntry extends FeedItemBase {
  type: 'entry'
  entry: EntryWithCategory
  /** A importação de extrato que gravou este lançamento; `null` para digitado. */
  importBatchId: string | null
}

export interface FeedRule extends FeedItemBase {
  type: 'recurring'
  kind: EntryKind
  description: string
  amountCents: number
  frequency: RecurrenceFrequency
  startsOn: ISODate
  isActive: boolean
}

export interface FeedPlan extends FeedItemBase {
  type: 'installment'
  description: string
  totalAmountCents: number
  installmentsCount: number
  firstDueOn: ISODate
}

export type FeedItem = FeedEntry | FeedRule | FeedPlan

interface EntryRow {
  id: string
  kind: EntryKind
  occurred_on: string
  description: string
  amount_cents: number
  notes: string | null
  is_settled: boolean
  settled_on: string | null
  source: EntryWithCategory['source']
  source_id: string | null
  occurrence_key: string | null
  installment_number: number | null
  installment_total: number | null
  keywords: string[]
  credit_account_id: string | null
  charge_first_due_on: string | null
  charge_count: number
  interest_cents: number
  created_at: string
  import_batch_id: string | null
  category_id: string | null
  categories: { id: string; name: string; color: string; icon: string | null } | null
}

export async function listCreatedFeed({
  limit = 40,
  before,
}: {
  limit?: number
  /** `feedCursor()` do último item já exibido; ausente para a primeira página. */
  before?: string
}): Promise<{ items: FeedItem[]; hasMore: boolean }> {
  const supabase = await createClient()
  // Um a mais do que o pedido, para saber se existe próxima página sem outra ida ao banco.
  const take = limit + 1

  let entriesQuery = supabase
    .from('entries')
    .select(ENTRY_COLUMNS)
    .eq('source', 'manual')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(take)
  let rulesQuery = supabase
    .from('recurring_rules')
    .select('id, kind, description, amount_cents, frequency, starts_on, is_active, created_at')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(take)
  let plansQuery = supabase
    .from('installment_plans')
    .select('id, description, total_amount_cents, installments_count, first_due_on, created_at')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(take)

  const cursor = parseFeedCursor(before)
  if (cursor) {
    // (created_at, id) < (cursor): mais antigo, ou mesmo instante com id menor. Aspas porque o
    // instante tem `:` e `+`, que a sintaxe de `or` do PostgREST reservaria.
    const filter = `created_at.lt."${cursor.createdAt}",and(created_at.eq."${cursor.createdAt}",id.lt.${cursor.id})`
    entriesQuery = entriesQuery.or(filter)
    rulesQuery = rulesQuery.or(filter)
    plansQuery = plansQuery.or(filter)
  }

  const [entries, rules, plans] = await Promise.all([entriesQuery, rulesQuery, plansQuery])
  if (entries.error) throw new Error(`Falha ao listar lançamentos: ${entries.error.message}`)
  if (rules.error) throw new Error(`Falha ao listar contas fixas: ${rules.error.message}`)
  if (plans.error) throw new Error(`Falha ao listar parcelamentos: ${plans.error.message}`)

  const entryItems: FeedEntry[] = (entries.data as unknown as EntryRow[]).map((row) => ({
    type: 'entry',
    id: row.id,
    createdAt: row.created_at,
    importBatchId: row.import_batch_id,
    entry: {
      id: row.id,
      kind: row.kind,
      occurredOn: row.occurred_on,
      description: row.description,
      amountCents: Number(row.amount_cents),
      notes: row.notes,
      isSettled: row.is_settled,
      settledOn: row.settled_on,
      source: row.source,
      sourceId: row.source_id,
      occurrenceKey: row.occurrence_key,
      installmentNumber: row.installment_number,
      installmentTotal: row.installment_total,
      keywords: row.keywords ?? [],
      creditAccountId: row.credit_account_id,
      chargeFirstDueOn: row.charge_first_due_on,
      chargeCount: row.charge_count,
      interestCents: Number(row.interest_cents),
      category: row.categories,
    },
  }))

  const ruleItems: FeedRule[] = (rules.data ?? []).map((row) => ({
    type: 'recurring',
    id: row.id,
    createdAt: row.created_at,
    kind: row.kind,
    description: row.description,
    amountCents: Number(row.amount_cents),
    frequency: row.frequency,
    startsOn: row.starts_on,
    isActive: row.is_active,
  }))

  const planItems: FeedPlan[] = (plans.data ?? []).map((row) => ({
    type: 'installment',
    id: row.id,
    createdAt: row.created_at,
    description: row.description,
    totalAmountCents: Number(row.total_amount_cents),
    installmentsCount: row.installments_count,
    firstDueOn: row.first_due_on,
  }))

  const merged = mergeByCreatedAt<FeedItem>([entryItems, ruleItems, planItems], take)
  return { items: merged.slice(0, limit), hasMore: merged.length > limit }
}

/** Uma importação de extrato, como o atalho de seleção a mostra. */
export interface ImportBatch {
  id: string
  /** Quantos lançamentos dela ainda existem — inclusive os de outras páginas. */
  count: number
  /** O período do extrato: a menor e a maior data de competência. */
  from: ISODate
  to: ISODate
}

/**
 * As importações citadas na página, com o tamanho de cada uma. v1.0 — 2026-09-27.
 *
 * Só as da página, e não todas: é delas que a pessoa pode pedir "selecionar todos". Uma
 * importação tem no máximo 1000 linhas (`MAX_IMPORT_ROWS`), e a página cita poucas, então a
 * contagem aqui mesmo é barata — sem depender de agregação no PostgREST.
 */
export async function listImportBatches(batchIds: readonly string[]): Promise<ImportBatch[]> {
  if (batchIds.length === 0) return []
  const supabase = await createClient()

  // O Supabase devolve no máximo 1000 linhas por pedido; várias importações na mesma página
  // passam disso, então pagina — como `prepareImport`.
  const rows: { import_batch_id: string | null; occurred_on: string }[] = []
  for (let page = 0; page < 20; page += 1) {
    const { data, error } = await supabase
      .from('entries')
      .select('import_batch_id, occurred_on')
      .in('import_batch_id', [...batchIds])
      .order('id')
      .range(page * 1000, page * 1000 + 999)
    if (error) throw new Error(`Falha ao ler importações: ${error.message}`)
    rows.push(...data)
    if (data.length < 1000) break
  }

  const batches = new Map<string, ImportBatch>()
  for (const row of rows) {
    if (!row.import_batch_id) continue
    const atual = batches.get(row.import_batch_id)
    if (!atual) {
      batches.set(row.import_batch_id, {
        id: row.import_batch_id,
        count: 1,
        from: row.occurred_on,
        to: row.occurred_on,
      })
    } else {
      atual.count += 1
      if (row.occurred_on < atual.from) atual.from = row.occurred_on
      if (row.occurred_on > atual.to) atual.to = row.occurred_on
    }
  }
  return [...batches.values()]
}
