'use server'

import { revalidatePath } from 'next/cache'
import { currentUserId } from '@/lib/db/current-user'
import { createClient } from '@/lib/supabase/server'
import {
  createScenarioEntrySchema,
  createScenarioSchema,
  removeOverrideSchema,
  renameScenarioSchema,
  scenarioEntryIdSchema,
  scenarioIdSchema,
  setOverrideSchema,
} from '@/lib/validation/scenarios'

/**
 * Escrita de cenários.
 *
 * A regra que governa este arquivo inteiro: **nada aqui toca em dado real.**
 * Um cenário é uma lente sobre a projeção, e guarda só o delta —
 * `scenario_overrides` e `scenario_entries` (invariante 6).
 *
 * No app antigo, `syncPlanToGlobal` fazia o contrário: editar um valor dentro
 * do planejamento sobrescrevia o lançamento verdadeiro, e não havia como
 * desfazer. Aqui a projeção com cenário e a projeção real saem do mesmo dado;
 * o que muda é o que o motor aplica por cima na hora de calcular.
 *
 * O `db:verify` prova isso: uma asserção conta as linhas e soma os valores de
 * `entries` antes e depois de gravar um override, e falha se qualquer um mudar.
 */

export interface ScenarioActionState {
  error?: string
  success?: string
}

function revalidateScenarioViews(): void {
  revalidatePath('/projecao')
  revalidatePath('/cenarios')
}

export async function createScenario(
  _prev: ScenarioActionState,
  formData: FormData,
): Promise<ScenarioActionState> {
  const parsed = createScenarioSchema.safeParse({
    name: formData.get('name'),
    startsOn: formData.get('startsOn'),
    endsOn: formData.get('endsOn'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  const userId = await currentUserId()
  const supabase = await createClient()

  const { error } = await supabase.from('scenarios').insert({
    user_id: userId,
    name: parsed.data.name,
    starts_on: parsed.data.startsOn,
    ends_on: parsed.data.endsOn,
  })

  if (error) return { error: `Não foi possível criar: ${error.message}` }

  revalidateScenarioViews()
  return { success: 'Cenário criado.' }
}

export async function renameScenario(
  _prev: ScenarioActionState,
  formData: FormData,
): Promise<ScenarioActionState> {
  const parsed = renameScenarioSchema.safeParse({
    id: formData.get('id'),
    name: formData.get('name'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('scenarios')
    .update({ name: parsed.data.name })
    .eq('id', parsed.data.id)
    .select('id')

  if (error) return { error: `Não foi possível salvar: ${error.message}` }
  if (!data || data.length === 0) return { error: 'Cenário não encontrado.' }

  revalidateScenarioViews()
  return { success: 'Cenário renomeado.' }
}

/**
 * Exclui o cenário.
 *
 * Os overrides e os itens hipotéticos saem junto, por `on delete cascade` —
 * e nenhum lançamento real é afetado, porque nunca houve ligação de escrita
 * entre os dois lados.
 */
export async function deleteScenario(
  _prev: ScenarioActionState,
  formData: FormData,
): Promise<ScenarioActionState> {
  const parsed = scenarioIdSchema.safeParse({ id: formData.get('id') })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Cenário inválido' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('scenarios')
    .delete()
    .eq('id', parsed.data.id)
    .select('id')

  if (error) return { error: `Não foi possível excluir: ${error.message}` }
  if (!data || data.length === 0) return { error: 'Cenário não encontrado.' }

  revalidateScenarioViews()
  return { success: 'Cenário excluído. Seus lançamentos continuam como estavam.' }
}

/**
 * Marca o cenário que a projeção abre por padrão.
 *
 * Via RPC porque trocar o ativo é desativar um e ativar outro, e o índice
 * `scenarios_one_active_idx` permite só um por usuário. O app antigo fazia isso
 * em `await` sequenciais no cliente e uma falha no meio deixava dois ativos.
 */
export async function activateScenario(
  _prev: ScenarioActionState,
  formData: FormData,
): Promise<ScenarioActionState> {
  const parsed = scenarioIdSchema.safeParse({ id: formData.get('id') })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Cenário inválido' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('activate_scenario', { p_scenario_id: parsed.data.id })

  if (error) return { error: `Não foi possível ativar: ${error.message}` }

  revalidateScenarioViews()
  return { success: 'Cenário definido como padrão.' }
}

/**
 * Grava um ajuste sobre uma ocorrência.
 *
 * Via RPC porque `scenario_overrides_target_uniq` é um índice sobre expressão
 * (`coalesce(occurrence_key, '')`), e o `upsert()` do supabase-js só sabe
 * listar colunas — não consegue nomear a expressão, e portanto não infere o
 * índice. Sem o upsert, ajustar a mesma ocorrência duas vezes criaria duas
 * linhas disputando entre si.
 *
 * O alvo (`targetType`, `targetId`, `occurrenceKey`) vem de
 * `overrideTargetOf()`, a mesma função que o motor usa para ler o override de
 * volta. Se os dois lados montassem o alvo por conta própria, divergiriam e o
 * ajuste deixaria de casar — sem erro nenhum, só deixando de funcionar.
 */
export async function setOverride(
  _prev: ScenarioActionState,
  formData: FormData,
): Promise<ScenarioActionState> {
  const parsed = setOverrideSchema.safeParse({
    scenarioId: formData.get('scenarioId'),
    targetType: formData.get('targetType'),
    targetId: formData.get('targetId'),
    occurrenceKey: formData.get('occurrenceKey') ?? '',
    isIncluded: formData.get('isIncluded'),
    amountCents: formData.get('amountCents') ?? '',
    dateOverride: formData.get('dateOverride') ?? '',
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('set_scenario_override', {
    p_scenario_id: parsed.data.scenarioId,
    p_target_type: parsed.data.targetType,
    p_target_id: parsed.data.targetId,
    p_occurrence_key: parsed.data.occurrenceKey ?? undefined,
    p_is_included: parsed.data.isIncluded,
    p_amount_cents: parsed.data.amountCents ?? undefined,
    p_date_override: parsed.data.dateOverride ?? undefined,
  })

  if (error) return { error: `Não foi possível ajustar: ${error.message}` }

  revalidateScenarioViews()
  return { success: 'Ajuste aplicado ao cenário.' }
}

/** Remove o ajuste: a ocorrência volta a valer como está na realidade. */
export async function removeOverride(
  _prev: ScenarioActionState,
  formData: FormData,
): Promise<ScenarioActionState> {
  const parsed = removeOverrideSchema.safeParse({
    scenarioId: formData.get('scenarioId'),
    targetType: formData.get('targetType'),
    targetId: formData.get('targetId'),
    occurrenceKey: formData.get('occurrenceKey') ?? '',
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  const supabase = await createClient()

  let query = supabase
    .from('scenario_overrides')
    .delete()
    .eq('scenario_id', parsed.data.scenarioId)
    .eq('target_type', parsed.data.targetType)
    .eq('target_id', parsed.data.targetId)

  // `is null` e `eq` são consultas diferentes: NULL não casa com igualdade.
  query =
    parsed.data.occurrenceKey === null
      ? query.is('occurrence_key', null)
      : query.eq('occurrence_key', parsed.data.occurrenceKey)

  const { error } = await query

  if (error) return { error: `Não foi possível remover o ajuste: ${error.message}` }

  revalidateScenarioViews()
  return { success: 'Ajuste removido.' }
}

/** Item que só existe dentro do cenário — o "e se eu comprasse um carro". */
export async function createScenarioEntry(
  _prev: ScenarioActionState,
  formData: FormData,
): Promise<ScenarioActionState> {
  const parsed = createScenarioEntrySchema.safeParse({
    scenarioId: formData.get('scenarioId'),
    kind: formData.get('kind'),
    description: formData.get('description'),
    amountCents: formData.get('amountCents'),
    occursOn: formData.get('occursOn'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  const userId = await currentUserId()
  const supabase = await createClient()

  const { error } = await supabase.from('scenario_entries').insert({
    scenario_id: parsed.data.scenarioId,
    user_id: userId,
    kind: parsed.data.kind,
    description: parsed.data.description,
    amount_cents: parsed.data.amountCents,
    occurs_on: parsed.data.occursOn,
  })

  if (error) return { error: `Não foi possível adicionar: ${error.message}` }

  revalidateScenarioViews()
  return { success: 'Item hipotético adicionado.' }
}

export async function deleteScenarioEntry(
  _prev: ScenarioActionState,
  formData: FormData,
): Promise<ScenarioActionState> {
  const parsed = scenarioEntryIdSchema.safeParse({ id: formData.get('id') })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Item inválido' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('scenario_entries')
    .delete()
    .eq('id', parsed.data.id)
    .select('id')

  if (error) return { error: `Não foi possível remover: ${error.message}` }
  if (!data || data.length === 0) return { error: 'Item não encontrado.' }

  revalidateScenarioViews()
  return { success: 'Item removido.' }
}
