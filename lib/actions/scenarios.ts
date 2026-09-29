'use server'

import { revalidatePath } from 'next/cache'
import { currentUserId } from '@/lib/db/current-user'
import { listEntriesByMonth } from '@/lib/db/queries/entries'
import { todayISO, type ISODate } from '@/lib/finance/date'
import {
  duplicateHabits,
  habitTargetMonths,
  habitWindowStart,
  summarizeHabits,
  type HabitCopy,
  type HabitKinds,
  type HabitSummary,
} from '@/lib/finance/habits'
import { createClient } from '@/lib/supabase/server'
import {
  createScenarioEntrySchema,
  createScenarioSchema,
  habitsPreviewSchema,
  habitsSchema,
  removeOverrideSchema,
  renameScenarioSchema,
  scenarioEntryIdSchema,
  scenarioIdSchema,
  setOverrideSchema,
  updateScenarioEntrySchema,
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
 *
 * v1.1 — 2026-09-27: "Duplicar hábitos" (`previewHabits` e `createScenario` com hábitos) e
 * edição de item hipotético (`updateScenarioEntry`). Os duplicados são `scenario_entries` —
 * a regra acima continua valendo: nada aqui escreve em `entries`.
 */

export interface ScenarioActionState {
  error?: string
  success?: string
}

function revalidateScenarioViews(): void {
  revalidatePath('/analise')
  // 28/09/2026 (Fase 14): cenários também se criam e se veem na planilha.
  revalidatePath('/planilha', 'layout')
  revalidatePath('/cenarios')
}

/**
 * O teto de itens que uma duplicação grava de uma vez. Um mês cheio de hábitos (~150
 * lançamentos) repetido por 18 meses já passa de 2.500; acima disso, o cenário deixa de ser
 * legível e o `insert` em lote fica pesado demais para um request.
 */
const MAX_HABIT_COPIES = 3000

/** Os parâmetros de hábito lidos do formulário. */
function readHabits(formData: FormData) {
  return {
    sourceMonth: formData.get('sourceMonth') ?? '',
    target: formData.get('habitTarget') ?? 'all',
    rangeFrom: formData.get('rangeFrom') ?? '',
    rangeTo: formData.get('rangeTo') ?? '',
  }
}

/**
 * Os itens que um hábito gera, para um cenário de `startsOn` a `endsOn`.
 *
 * Lê só o mês de origem — é o único que interessa — e deixa a regra inteira (o que conta
 * como hábito, o alinhamento pelo dia da semana, o corte em hoje) para `lib/finance/habits`.
 */
async function computeHabits(options: {
  sourceMonth: string
  range: { from: string; to: string } | null
  kinds: HabitKinds
  startsOn: ISODate
  endsOn: ISODate
}): Promise<{ copies: HabitCopy[]; months: string[] }> {
  const from = habitWindowStart(options.startsOn, todayISO())
  const months = habitTargetMonths({
    sourceMonth: options.sourceMonth,
    from,
    to: options.endsOn,
    range: options.range,
  })
  const entries = await listEntriesByMonth({ month: options.sourceMonth })
  const copies = duplicateHabits({
    entries: entries.map((entry) => ({ ...entry, categoryId: entry.category?.id ?? null })),
    sourceMonth: options.sourceMonth,
    targetMonths: months,
    kinds: options.kinds,
    from,
    to: options.endsOn,
  })
  return { copies, months }
}

export interface HabitsPreview {
  error?: string
  summary?: HabitSummary
  /** Meses que recebem o hábito, `YYYY-MM`. */
  months?: string[]
}

/**
 * Prévia da duplicação: quanto de cada tipo seria repetido, e em que meses. Não escreve nada.
 *
 * v1.0 — 2026-09-27. É o que sustenta a pergunta "tudo, só saídas ou só entradas?": a pessoa
 * responde vendo o tamanho de cada resposta.
 */
export async function previewHabits(formData: FormData): Promise<HabitsPreview> {
  const scenario = createScenarioSchema.safeParse({
    name: formData.get('name') || 'prévia',
    startsOn: formData.get('startsOn'),
    endsOn: formData.get('endsOn'),
  })
  if (!scenario.success) return { error: scenario.error.issues[0]?.message ?? 'Período inválido' }

  const habits = habitsPreviewSchema.safeParse(readHabits(formData))
  if (!habits.success) return { error: habits.error.issues[0]?.message ?? 'Dados inválidos' }

  const { copies, months } = await computeHabits({
    ...habits.data,
    kinds: 'all',
    startsOn: scenario.data.startsOn,
    endsOn: scenario.data.endsOn,
  })

  return { summary: summarizeHabits(copies), months }
}

/**
 * Cria o cenário — e, com "Duplicar hábitos" ligado, já com os itens do hábito dentro.
 *
 * v1.1 — 2026-09-27: os hábitos. São duas escritas (o cenário e os itens) e o supabase-js não
 * tem transação; se a segunda falhar, a primeira é desfeita aqui, para não sobrar um cenário
 * "com hábitos" vazio que a pessoa acharia que funcionou.
 */
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

  const withHabits = formData.get('habits') === 'on'
  let copies: HabitCopy[] = []
  if (withHabits) {
    const habits = habitsSchema.safeParse({ ...readHabits(formData), kinds: formData.get('kinds') })
    if (!habits.success) {
      return { error: habits.error.issues[0]?.message ?? 'Dados inválidos' }
    }
    copies = (
      await computeHabits({
        ...habits.data,
        startsOn: parsed.data.startsOn,
        endsOn: parsed.data.endsOn,
      })
    ).copies
    if (copies.length > MAX_HABIT_COPIES) {
      return {
        error: `Seriam ${copies.length} itens — o limite é ${MAX_HABIT_COPIES}. Encurte o período ou escolha menos meses.`,
      }
    }
  }

  const userId = await currentUserId()
  const supabase = await createClient()

  const { data: created, error } = await supabase
    .from('scenarios')
    .insert({
      user_id: userId,
      name: parsed.data.name,
      starts_on: parsed.data.startsOn,
      ends_on: parsed.data.endsOn,
    })
    .select('id')
    .single()

  if (error) return { error: `Não foi possível criar: ${error.message}` }

  if (copies.length > 0) {
    const { error: copyError } = await supabase.from('scenario_entries').insert(
      copies.map((copy) => ({
        scenario_id: created.id,
        user_id: userId,
        kind: copy.kind,
        description: copy.description,
        amount_cents: copy.amountCents,
        occurs_on: copy.occursOn,
        category_id: copy.categoryId,
      })),
    )

    if (copyError) {
      // Desfaz o cenário: os itens que entraram, se algum, saem junto por `on delete cascade`.
      await supabase.from('scenarios').delete().eq('id', created.id).select('id')
      return { error: `Não foi possível duplicar os hábitos: ${copyError.message}` }
    }
  }

  revalidateScenarioViews()
  if (!withHabits) return { success: 'Cenário criado.' }
  return {
    success:
      copies.length === 0
        ? 'Cenário criado. Nenhum lançamento avulso daquele mês cabia no período escolhido.'
        : `Cenário criado com ${copies.length} ${copies.length === 1 ? 'item repetido' : 'itens repetidos'} do hábito.`,
  }
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
    categoryId: formData.get('categoryId') ?? '',
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
    category_id: parsed.data.categoryId,
  })

  if (error) return { error: `Não foi possível adicionar: ${error.message}` }

  revalidateScenarioViews()
  return { success: 'Item hipotético adicionado.' }
}

/**
 * Edita um item hipotético — inclusive os que vieram de "Duplicar hábitos".
 *
 * v1.0 — 2026-09-27. Um item duplicado é uma linha como outra qualquer de
 * `scenario_entries`, sem vínculo com o lançamento que o originou, e se edita como se tivesse
 * sido somado à mão. `.select()` conferido (invariante 17): id de outra pessoa não casa pela
 * RLS e o supabase-js devolveria sucesso em silêncio.
 */
export async function updateScenarioEntry(
  _prev: ScenarioActionState,
  formData: FormData,
): Promise<ScenarioActionState> {
  const parsed = updateScenarioEntrySchema.safeParse({
    id: formData.get('id'),
    kind: formData.get('kind'),
    description: formData.get('description'),
    amountCents: formData.get('amountCents'),
    occursOn: formData.get('occursOn'),
    categoryId: formData.get('categoryId') ?? '',
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('scenario_entries')
    .update({
      kind: parsed.data.kind,
      description: parsed.data.description,
      amount_cents: parsed.data.amountCents,
      occurs_on: parsed.data.occursOn,
      category_id: parsed.data.categoryId,
    })
    .eq('id', parsed.data.id)
    .select('id')

  if (error) return { error: `Não foi possível salvar: ${error.message}` }
  if (!data || data.length === 0) return { error: 'Item não encontrado.' }

  revalidateScenarioViews()
  return { success: 'Item atualizado.' }
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
