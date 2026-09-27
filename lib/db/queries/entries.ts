import { endOfMonth, startOfMonth, type ISODate } from '@/lib/finance/date'
import { normalizeText } from '@/lib/finance/keywords'
import type { EntryKind, EntrySource } from '@/lib/db/types'
import { createClient } from '@/lib/supabase/server'

/**
 * Leitura de lançamentos. v1.1 — 2026-09-26.
 *
 * Como em `categories.ts`, nenhuma query repete `eq('user_id', ...)` — quem
 * restringe as linhas é a RLS. E coluna explícita em vez de `select('*')`.
 *
 * v1.1: acrescentada `listEntriesInRange`, para o resumo da IA ler o histórico de
 * um período escolhido. Nenhuma das outras servia, e por quê está no docblock dela.
 *
 * v1.2 — 2026-09-27: `keywords` na linha (a edição do Histórico mostra as palavras que ligam o
 * lançamento ao extrato) e `listImportedDescriptions`, que alimenta as sugestões do campo.
 */

const COLUMNS = `
  id, kind, occurred_on, description, amount_cents, notes,
  is_settled, settled_on, source, source_id, occurrence_key,
  installment_number, installment_total, keywords,
  category_id, categories ( id, name, color, icon )
` as const

/** Lançamento com a categoria já resolvida, do jeito que a lista precisa. */
export interface EntryWithCategory {
  id: string
  kind: EntryKind
  occurredOn: ISODate
  description: string
  amountCents: number
  notes: string | null
  isSettled: boolean
  settledOn: ISODate | null
  source: EntrySource
  sourceId: string | null
  occurrenceKey: string | null
  installmentNumber: number | null
  installmentTotal: number | null
  /** v1.2 — 2026-09-27: palavras que ligam este lançamento ao extrato (migration 0019). */
  keywords: string[]
  category: { id: string; name: string; color: string; icon: string | null } | null
}

interface JoinedRow {
  id: string
  kind: EntryKind
  occurred_on: string
  description: string
  amount_cents: number
  notes: string | null
  is_settled: boolean
  settled_on: string | null
  source: EntrySource
  source_id: string | null
  occurrence_key: string | null
  installment_number: number | null
  installment_total: number | null
  keywords: string[]
  category_id: string | null
  categories: { id: string; name: string; color: string; icon: string | null } | null
}

function toEntry(row: JoinedRow): EntryWithCategory {
  return {
    id: row.id,
    kind: row.kind,
    occurredOn: row.occurred_on,
    description: row.description,
    amountCents: row.amount_cents,
    notes: row.notes,
    isSettled: row.is_settled,
    settledOn: row.settled_on,
    source: row.source,
    sourceId: row.source_id,
    occurrenceKey: row.occurrence_key,
    installmentNumber: row.installment_number,
    installmentTotal: row.installment_total,
    keywords: row.keywords ?? [],
    category: row.categories,
  }
}

export interface EntryFilters {
  /** Mês no formato `YYYY-MM`. */
  month: string
  categoryId?: string
  kind?: EntryKind
  /** `true` só liquidados, `false` só pendentes, ausente para ambos. */
  settled?: boolean
}

/**
 * Lançamentos de um mês.
 *
 * Paginação por mês, e não scroll infinito: a consulta cai direto no índice
 * `entries_user_date_idx (user_id, occurred_on desc)`, e é assim que o usuário
 * pensa sobre as próprias contas.
 */
export async function listEntriesByMonth(filters: EntryFilters): Promise<EntryWithCategory[]> {
  const supabase = await createClient()

  const from = startOfMonth(`${filters.month}-01`)
  const to = endOfMonth(`${filters.month}-01`)

  let query = supabase
    .from('entries')
    .select(COLUMNS)
    .gte('occurred_on', from)
    .lte('occurred_on', to)
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })

  if (filters.categoryId) query = query.eq('category_id', filters.categoryId)
  if (filters.kind) query = query.eq('kind', filters.kind)
  if (filters.settled !== undefined) query = query.eq('is_settled', filters.settled)

  const { data, error } = await query
  if (error) throw new Error(`Falha ao listar lançamentos: ${error.message}`)

  return (data as unknown as JoinedRow[]).map(toEntry)
}

export interface MonthTotals {
  incomeCents: number
  expenseCents: number
  netCents: number
}

/**
 * Totais do mês.
 *
 * Soma em JavaScript sobre os lançamentos do mês, e não via a view
 * `v_monthly_summary`, por um motivo concreto: a lista já foi buscada para a
 * tela, e uma segunda ida ao banco para somar as mesmas linhas só adiciona
 * latência. A view serve aos gráficos de vários meses, na fase 3b.
 */
export function monthTotals(entries: readonly EntryWithCategory[]): MonthTotals {
  let incomeCents = 0
  let expenseCents = 0

  for (const entry of entries) {
    if (entry.kind === 'income') incomeCents += entry.amountCents
    else expenseCents += entry.amountCents
  }

  return { incomeCents, expenseCents, netCents: incomeCents - expenseCents }
}

/** Um lançamento, para a tela de edição. */
export async function getEntry(id: string): Promise<EntryWithCategory | null> {
  const supabase = await createClient()

  const { data, error } = await supabase.from('entries').select(COLUMNS).eq('id', id).maybeSingle()

  if (error) throw new Error(`Falha ao buscar lançamento: ${error.message}`)
  if (!data) return null

  return toEntry(data as unknown as JoinedRow)
}

/**
 * Os lançamentos mais recentes, sem filtro de mês.
 *
 * v1.1 — 2026-09-26: adicionada na fase 7. O assistente precisa saber do que a
 * pessoa está falando quando ela diz "apaga o do mercado" — sem uma lista de
 * candidatos com id, a IA teria de inventar um, e inventar id é exatamente o
 * que o contexto dela proíbe. Recorta por quantidade e não por mês porque
 * "recente" aqui é do ponto de vista da conversa, não do calendário.
 */
export async function listRecentEntries(limit = 40): Promise<EntryWithCategory[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('entries')
    .select(COLUMNS)
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`Falha ao listar lançamentos recentes: ${error.message}`)

  return (data as unknown as JoinedRow[]).map(toEntry)
}

/**
 * Lançamentos de uma janela de datas.
 *
 * v1.1 — 2026-09-26: nasceu para o resumo da IA, que passou a ler o histórico dos
 * últimos N dias em vez de só agregados. Nenhuma das funções acima servia, e a
 * tentadora é a errada:
 *
 *  - `listEntriesByMonth` recorta por mês de calendário. "Últimos 45 dias" viraria
 *    duas ou três chamadas e um filtro em JavaScript depois.
 *  - `listRecentEntries(N)` parece perfeita e tem um buraco: ela ordena por
 *    `occurred_on desc` **sem limite superior de data**. Uma conta a pagar lançada
 *    para o mês que vem vem primeiro e consome o limite — quem tem muitas contas
 *    futuras receberia zero lançamento dos últimos N dias. Ela também corta por
 *    quantidade, não por data: um mês pesado engole a janela, um mês leve vaza um
 *    ano para trás.
 *
 * Cai no índice `entries_user_date_idx (user_id, occurred_on desc)`, o mesmo de
 * `listEntriesByMonth`. O `limit` é teto de segurança para o prompt não estourar,
 * não regra de negócio: 60 dias de uso normal fica bem abaixo dele.
 */
export async function listEntriesInRange(
  from: ISODate,
  to: ISODate,
  limit = 300,
): Promise<EntryWithCategory[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('entries')
    .select(COLUMNS)
    .gte('occurred_on', from)
    .lte('occurred_on', to)
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`Falha ao listar o histórico: ${error.message}`)

  return (data as unknown as JoinedRow[]).map(toEntry)
}

/**
 * Pendentes para a agenda do Início: tudo em atraso, mais o que vence até o
 * horizonte.
 *
 * Sem filtro de mês, de propósito — uma conta esquecida em março tem de
 * aparecer em setembro, e foi justamente a agenda que sumia sozinha no app
 * antigo. Cai no índice `entries_user_pending_idx (user_id, occurred_on) where
 * is_settled = false`, que existe desde a migration 0004 para esta consulta.
 *
 * O `limit` protege a tela de uma lista absurda depois de meses sem uso; quem
 * quiser a lista inteira vai ao extrato com o filtro de pendentes.
 */
export async function listPendingEntries(
  horizon: ISODate,
  limit = 200,
): Promise<EntryWithCategory[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('entries')
    .select(COLUMNS)
    .eq('is_settled', false)
    .lte('occurred_on', horizon)
    .order('occurred_on', { ascending: true })
    .limit(limit)

  if (error) throw new Error(`Falha ao listar pendências: ${error.message}`)

  return (data as unknown as JoinedRow[]).map(toEntry)
}

/**
 * Descrições únicas do que já foi importado de extrato, para sugerir palavra-chave.
 * v1.0 — 2026-09-27.
 *
 * É o que a pessoa já viu escrito na conferência ("Pix de Empresa X"), e por isso o jeito
 * mais fácil de acertar a palavra que o próximo extrato vai trazer. Por tipo, mais
 * frequentes primeiro, comparando sem acento e sem caixa; o teto é de tamanho de página, não
 * de regra. Lê as 2000 importações mais recentes — o PostgREST não faz `distinct`.
 */
export async function listImportedDescriptions(
  limit = 500,
): Promise<Record<EntryKind, string[]>> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('entries')
    .select('description, kind')
    .not('import_key', 'is', null)
    .order('occurred_on', { ascending: false })
    .limit(2000)

  if (error) throw new Error(`Falha ao ler as importações: ${error.message}`)

  const tally: Record<EntryKind, Map<string, { text: string; count: number }>> = {
    expense: new Map(),
    income: new Map(),
  }
  for (const row of data ?? []) {
    const key = normalizeText(row.description)
    if (!key) continue
    const current = tally[row.kind].get(key)
    if (current) current.count += 1
    else tally[row.kind].set(key, { text: row.description, count: 1 })
  }

  const rank = (map: Map<string, { text: string; count: number }>) =>
    [...map.values()]
      .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text, 'pt-BR'))
      .slice(0, limit)
      .map((item) => item.text)

  return { expense: rank(tally.expense), income: rank(tally.income) }
}
