import type { EntryKind } from '@/lib/db/types'
import type { ISODate } from '@/lib/finance/date'
import type { RecurrenceFrequency, RecurringRule } from '@/lib/finance/types'
import { createClient } from '@/lib/supabase/server'

/**
 * Leitura de contas fixas.
 *
 * Como nas demais queries, nenhum `eq('user_id', ...)`: quem restringe as linhas
 * é a RLS. Coluna explícita em vez de `select('*')`.
 *
 * O tipo devolvido é `RecurringRule` de `lib/finance/types.ts` — o mesmo que
 * `expandRecurringRule()` consome. Sem um tipo intermediário: a query existe
 * justamente para alimentar o motor puro, e converter duas vezes só criaria
 * chance de divergir.
 */

const COLUMNS = `
  id, kind, description, amount_cents, category_id,
  frequency, day_of_month, starts_on, ends_on, is_active
` as const

interface Row {
  id: string
  kind: EntryKind
  description: string
  amount_cents: number
  category_id: string | null
  frequency: RecurrenceFrequency
  day_of_month: number | null
  starts_on: string
  ends_on: string | null
  is_active: boolean
}

function toRule(row: Row): RecurringRule {
  return {
    id: row.id,
    kind: row.kind,
    description: row.description,
    amountCents: Number(row.amount_cents),
    categoryId: row.category_id,
    frequency: row.frequency,
    dayOfMonth: row.day_of_month,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    isActive: row.is_active,
  }
}

/** A regra com o nome da categoria resolvido, para a lista. */
export interface RecurringRuleWithCategory extends RecurringRule {
  categoryName: string | null
  categoryColor: string | null
}

const COLUMNS_WITH_CATEGORY = `${COLUMNS}, categories ( name, color )` as const

type JoinedRow = Row & { categories: { name: string; color: string } | null }

function toRuleWithCategory(row: JoinedRow): RecurringRuleWithCategory {
  return {
    ...toRule(row),
    categoryName: row.categories?.name ?? null,
    categoryColor: row.categories?.color ?? null,
  }
}

/**
 * Todas as contas fixas, ativas primeiro.
 *
 * A tela mostra as inativas num grupo separado em vez de escondê-las: uma regra
 * desativada continua existindo, e sumir com ela faria a pessoa recriá-la —
 * criando duas regras para a mesma conta, que é como o app antigo acumulava
 * lixo.
 */
export async function listRecurringRules(): Promise<RecurringRuleWithCategory[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('recurring_rules')
    .select(COLUMNS_WITH_CATEGORY)
    .order('is_active', { ascending: false })
    .order('description', { ascending: true })

  if (error) throw new Error(`Falha ao listar contas fixas: ${error.message}`)

  return (data as unknown as JoinedRow[]).map(toRuleWithCategory)
}

/**
 * Só as ativas — é o que a agenda expande.
 *
 * Traz a categoria junto porque a agenda mostra o nome dela na linha, e uma
 * segunda ida ao banco para resolver um nome por regra seria N+1.
 */
export async function listActiveRecurringRules(): Promise<RecurringRuleWithCategory[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('recurring_rules')
    .select(COLUMNS_WITH_CATEGORY)
    .eq('is_active', true)

  if (error) throw new Error(`Falha ao listar contas fixas: ${error.message}`)

  return (data as unknown as JoinedRow[]).map(toRuleWithCategory)
}

/** Uma regra, para a tela de edição. */
export async function getRecurringRule(id: string): Promise<RecurringRule | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('recurring_rules')
    .select(COLUMNS)
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`Falha ao buscar conta fixa: ${error.message}`)
  if (!data) return null

  return toRule(data as unknown as Row)
}

/**
 * Quantas ocorrências desta regra já viraram lançamento.
 *
 * Derivado por contagem, nunca por contador mutável (invariante 7). A tela usa
 * para avisar, antes de excluir, que o histórico permanece.
 */
export async function countMaterialized(ruleId: string): Promise<number> {
  const supabase = await createClient()

  const { count, error } = await supabase
    .from('entries')
    .select('id', { count: 'exact', head: true })
    .eq('source', 'recurring')
    .eq('source_id', ruleId)

  if (error) throw new Error(`Falha ao contar ocorrências: ${error.message}`)
  return count ?? 0
}

/** Próximo vencimento não liquidado, ou `null`. Alimenta a lista. */
export function nextDueFrom(dates: readonly ISODate[], today: ISODate): ISODate | null {
  for (const date of dates) {
    if (date >= today) return date
  }
  return null
}
