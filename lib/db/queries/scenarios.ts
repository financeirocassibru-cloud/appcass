import type { ISODate } from '@/lib/finance/date'
import type { OverrideTarget, Scenario, ScenarioEntry, ScenarioOverride } from '@/lib/finance/types'
import { createClient } from '@/lib/supabase/server'

/**
 * Leitura de cenários.
 *
 * Um cenário guarda **só o delta** — os overrides e os itens hipotéticos. Nunca
 * uma cópia dos lançamentos (invariante 6). Foi a cópia em `dadosJSON` que
 * destruiu a consistência do app antigo: o planejamento e a realidade viravam
 * duas verdades, e editar uma não atualizava a outra.
 *
 * Por isso `getScenario()` devolve o tipo `Scenario` de `lib/finance/types.ts`,
 * pronto para `projectRange()` — o motor aplica o delta sobre os dados reais na
 * hora de calcular, e nada é materializado.
 */

export interface ScenarioSummary {
  id: string
  name: string
  startsOn: ISODate
  endsOn: ISODate
  isActive: boolean
  overrideCount: number
  entryCount: number
}

export async function listScenarios(): Promise<ScenarioSummary[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('scenarios')
    .select(
      'id, name, starts_on, ends_on, is_active, scenario_overrides(count), scenario_entries(count)',
    )
    .order('is_active', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Falha ao listar cenários: ${error.message}`)

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    isActive: row.is_active,
    // O agregado do PostgREST chega como `[{ count: n }]`.
    overrideCount: row.scenario_overrides?.[0]?.count ?? 0,
    entryCount: row.scenario_entries?.[0]?.count ?? 0,
  }))
}

/** O cenário completo, na forma que `projectRange()` consome. */
export async function getScenario(id: string): Promise<Scenario | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('scenarios')
    .select('id, name, starts_on, ends_on, opening_balance_cents')
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`Falha ao buscar cenário: ${error.message}`)
  if (!data) return null

  const [overrides, entries] = await Promise.all([listOverrides(id), listScenarioEntries(id)])

  return {
    id: data.id,
    name: data.name,
    startsOn: data.starts_on,
    endsOn: data.ends_on,
    openingBalanceCents: Number(data.opening_balance_cents),
    overrides,
    entries,
  }
}

/** O cenário marcado como ativo, ou `null`. É o que a projeção abre por padrão. */
export async function getActiveScenarioId(): Promise<string | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('scenarios')
    .select('id')
    .eq('is_active', true)
    .maybeSingle()

  if (error) throw new Error(`Falha ao buscar o cenário ativo: ${error.message}`)
  return data?.id ?? null
}

async function listOverrides(scenarioId: string): Promise<ScenarioOverride[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('scenario_overrides')
    .select('target_type, target_id, occurrence_key, is_included, amount_cents_override, date_override')
    .eq('scenario_id', scenarioId)

  if (error) throw new Error(`Falha ao ler os ajustes do cenário: ${error.message}`)

  return (data ?? []).map((row) => ({
    targetType: row.target_type as OverrideTarget,
    targetId: row.target_id,
    occurrenceKey: row.occurrence_key,
    isIncluded: row.is_included,
    amountCentsOverride:
      row.amount_cents_override === null ? null : Number(row.amount_cents_override),
    dateOverride: row.date_override,
  }))
}

async function listScenarioEntries(scenarioId: string): Promise<ScenarioEntry[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('scenario_entries')
    .select('id, kind, description, amount_cents, occurs_on, category_id')
    .eq('scenario_id', scenarioId)
    .order('occurs_on', { ascending: true })

  if (error) throw new Error(`Falha ao ler os itens do cenário: ${error.message}`)

  return (data ?? []).map((row) => ({
    id: row.id,
    kind: row.kind,
    description: row.description,
    amountCents: Number(row.amount_cents),
    occursOn: row.occurs_on,
    categoryId: row.category_id,
  }))
}
