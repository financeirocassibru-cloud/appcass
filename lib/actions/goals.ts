'use server'

import { revalidatePath } from 'next/cache'
import { currentUserId } from '@/lib/db/current-user'
import { createClient } from '@/lib/supabase/server'
import {
  archiveGoalSchema,
  contributionIdSchema,
  createContributionSchema,
  createGoalSchema,
  goalContributionSchema,
  goalIdSchema,
  goalMonthPlanSchema,
  updateGoalSchema,
} from '@/lib/validation/goals'
import { keywordsPatch } from '@/lib/validation/keywords'

/**
 * Escrita de metas e aportes.
 *
 * O que **não** existe aqui é um campo de progresso. O quanto já foi guardado é
 * `SUM(goal_contributions)`, lido de `v_goal_progress` (invariante 7). O app
 * antigo mantinha um acumulado gravado, e ele descolava da realidade no
 * primeiro aporte editado por fora.
 *
 * v1.1 — 2026-09-27: metas nascem no [+] (modo Meta), com palavras-chave (migration 0019), e
 * o aporte feito por lá é uma **saída** — `recordGoalContribution` grava, numa transação, o
 * lançamento (`source = 'goal'`) e o aporte amarrado a ele por `entry_id`. Excluir o aporte
 * dessa forma exclui a saída, e o cascade leva o aporte junto.
 *
 * v1.2 — 28/09/2026 (Fase 14): `setGoalMonthPlan` — o aporte previsto de
 * UM mês, fixado pela planilha ("Só este mês", migration 0023). O resto continua derivado: o que
 * falta é rateado pelos outros meses (`expandGoal`).
 */

export interface GoalActionState {
  error?: string
  success?: string
}

function revalidateGoalViews(): void {
  revalidatePath('/metas')
  // v1.2 — 28/09/2026 (Fase 14): a planilha mostra os aportes previstos e os reais.
  revalidatePath('/planilha', 'layout')
  revalidatePath('/analise')
  // v1.1 — 2026-09-27: o aporte como saída aparece no saldo, no Histórico e no [+].
  revalidatePath('/')
  revalidatePath('/historico')
  revalidatePath('/novo')
  revalidatePath('/novo/lancamentos')
}

function readGoalForm(formData: FormData) {
  return {
    name: formData.get('name'),
    targetAmountCents: formData.get('targetAmountCents'),
    targetDate: formData.get('targetDate') ?? '',
    monthlyContributionCents: formData.get('monthlyContributionCents') ?? '',
    keywords: formData.get('keywords'),
  }
}

export async function createGoal(
  _prev: GoalActionState,
  formData: FormData,
): Promise<GoalActionState> {
  const parsed = createGoalSchema.safeParse(readGoalForm(formData))
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  const userId = await currentUserId()
  const supabase = await createClient()

  const { error } = await supabase.from('goals').insert({
    user_id: userId,
    name: parsed.data.name,
    target_amount_cents: parsed.data.targetAmountCents,
    target_date: parsed.data.targetDate,
    monthly_contribution_cents: parsed.data.monthlyContributionCents,
    ...keywordsPatch(parsed.data.keywords),
  })

  if (error) return { error: `Não foi possível criar: ${error.message}` }

  revalidateGoalViews()
  return { success: 'Meta criada.' }
}

export async function updateGoal(
  _prev: GoalActionState,
  formData: FormData,
): Promise<GoalActionState> {
  const parsed = updateGoalSchema.safeParse({
    ...readGoalForm(formData),
    id: formData.get('id'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  const supabase = await createClient()

  // `.select()` conferido (invariante 17).
  const { data, error } = await supabase
    .from('goals')
    .update({
      name: parsed.data.name,
      target_amount_cents: parsed.data.targetAmountCents,
      target_date: parsed.data.targetDate,
      monthly_contribution_cents: parsed.data.monthlyContributionCents,
      ...keywordsPatch(parsed.data.keywords),
    })
    .eq('id', parsed.data.id)
    .select('id')

  if (error) return { error: `Não foi possível salvar: ${error.message}` }
  if (!data || data.length === 0) return { error: 'Meta não encontrada.' }

  revalidateGoalViews()
  return { success: 'Meta atualizada.' }
}

/**
 * Arquiva ou restaura.
 *
 * Arquivar é o caminho normal para "não quero mais essa meta": ela sai da
 * projeção e da lista, e os aportes continuam no histórico. Excluir é para
 * quem criou errado — e aí leva os aportes junto, por cascade.
 */
export async function archiveGoal(
  _prev: GoalActionState,
  formData: FormData,
): Promise<GoalActionState> {
  const parsed = archiveGoalSchema.safeParse({
    id: formData.get('id'),
    archive: formData.get('archive'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('goals')
    .update({ archived_at: parsed.data.archive ? new Date().toISOString() : null })
    .eq('id', parsed.data.id)
    .select('id')

  if (error) return { error: `Não foi possível atualizar: ${error.message}` }
  if (!data || data.length === 0) return { error: 'Meta não encontrada.' }

  revalidateGoalViews()
  return { success: parsed.data.archive ? 'Meta arquivada.' : 'Meta restaurada.' }
}

export async function deleteGoal(
  _prev: GoalActionState,
  formData: FormData,
): Promise<GoalActionState> {
  const parsed = goalIdSchema.safeParse({ id: formData.get('id') })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Meta inválida' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('goals')
    .delete()
    .eq('id', parsed.data.id)
    .select('id')

  if (error) return { error: `Não foi possível excluir: ${error.message}` }
  if (!data || data.length === 0) return { error: 'Meta não encontrada.' }

  revalidateGoalViews()
  return { success: 'Meta excluída, com os aportes dela.' }
}

/**
 * Registra um aporte — ou um resgate.
 *
 * Resgate é um aporte com valor negativo, e não a exclusão de um aporte
 * anterior: o dinheiro entrou de verdade e depois saiu de verdade, e as duas
 * coisas são história. O saldo da meta continua sendo a soma, qualquer que seja
 * o sinal das parcelas — a constraint do banco só barra o zero.
 *
 * O aporte **não** cria lançamento em `entries`. Guardar dinheiro para uma meta
 * costuma ser uma transferência entre contas suas, não um gasto; tratá-lo como
 * gasto faria o saldo cair duas vezes quando a compra finalmente acontecesse.
 * A coluna `goal_contributions.entry_id` existe para amarrar os dois quando
 * fizer sentido, e fica para quando houver tela de transferência.
 */
export async function createContribution(
  _prev: GoalActionState,
  formData: FormData,
): Promise<GoalActionState> {
  const parsed = createContributionSchema.safeParse({
    goalId: formData.get('goalId'),
    amountCents: formData.get('amountCents'),
    isWithdrawal: formData.get('isWithdrawal'),
    occurredOn: formData.get('occurredOn'),
    note: formData.get('note') ?? '',
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  const userId = await currentUserId()
  const supabase = await createClient()

  const amount = parsed.data.isWithdrawal
    ? -Math.abs(parsed.data.amountCents)
    : Math.abs(parsed.data.amountCents)

  const { error } = await supabase.from('goal_contributions').insert({
    goal_id: parsed.data.goalId,
    user_id: userId,
    amount_cents: amount,
    occurred_on: parsed.data.occurredOn,
    note: parsed.data.note,
  })

  if (error) return { error: `Não foi possível registrar: ${error.message}` }

  revalidateGoalViews()
  return { success: parsed.data.isWithdrawal ? 'Resgate registrado.' : 'Aporte registrado.' }
}

/**
 * Aporte como saída, pelo [+]. v1.0 — 2026-09-27.
 *
 * O dinheiro saiu da conta corrente para a meta: é uma saída (entra no saldo e no "guardado"
 * da Análise) **e** um aporte (entra no progresso). `record_goal_contribution` grava os dois
 * numa transação, com o `occurrence_key` do mês que faz o aporte previsto sumir da projeção.
 */
export async function recordGoalContribution(
  _prev: GoalActionState,
  formData: FormData,
): Promise<GoalActionState> {
  const parsed = goalContributionSchema.safeParse({
    goalId: formData.get('goalId'),
    amountCents: formData.get('amountCents'),
    occurredOn: formData.get('occurredOn'),
    note: formData.get('notes'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('record_goal_contribution', {
    p_goal_id: parsed.data.goalId,
    p_amount_cents: parsed.data.amountCents,
    p_occurred_on: parsed.data.occurredOn,
    ...(parsed.data.note === null ? {} : { p_note: parsed.data.note }),
  })

  if (error) return { error: `Não foi possível registrar: ${error.message}` }
  if (!data) return { error: 'Não foi possível registrar o aporte.' }

  revalidateGoalViews()
  revalidatePath(`/metas/${parsed.data.goalId}`)
  return { success: 'Aporte registrado.' }
}

export async function deleteContribution(
  _prev: GoalActionState,
  formData: FormData,
): Promise<GoalActionState> {
  const parsed = contributionIdSchema.safeParse({ id: formData.get('id') })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Aporte inválido' }
  }

  const supabase = await createClient()

  // v1.1 — 2026-09-27: aporte feito como saída? Exclui a saída — o cascade leva o aporte, e
  // os dois somem juntos. Apagar só o aporte deixaria uma saída de "Meta" sem meta.
  const found = await supabase
    .from('goal_contributions')
    .select('entry_id')
    .eq('id', parsed.data.id)
    .maybeSingle()
  if (found.error) return { error: `Não foi possível excluir: ${found.error.message}` }
  if (!found.data) return { error: 'Aporte não encontrado.' }

  const { data, error } = found.data.entry_id
    ? await supabase.from('entries').delete().eq('id', found.data.entry_id).select('id')
    : await supabase.from('goal_contributions').delete().eq('id', parsed.data.id).select('id')

  if (error) return { error: `Não foi possível excluir: ${error.message}` }
  if (!data || data.length === 0) return { error: 'Aporte não encontrado.' }

  revalidateGoalViews()
  return { success: found.data.entry_id ? 'Aporte e a saída dele excluídos.' : 'Aporte excluído.' }
}

/**
 * v1.2 — 28/09/2026 (Fase 14): fixa o aporte previsto de um mês. Função do banco
 * (`set_goal_month_plan`, migration 0023): o privilégio de coluna só deixa mudar o valor, e o
 * `upsert()` do supabase-js mandaria todas as colunas. A meta de outra pessoa não é encontrada —
 * a função é `security invoker` e lê `goals` pela RLS.
 */
export async function setGoalMonthPlan(
  _prev: GoalActionState,
  formData: FormData,
): Promise<GoalActionState> {
  const parsed = goalMonthPlanSchema.safeParse({
    goalId: formData.get('goalId'),
    month: formData.get('month'),
    amountCents: formData.get('amountCents'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('set_goal_month_plan', {
    p_goal_id: parsed.data.goalId,
    p_month: parsed.data.month,
    p_amount_cents: parsed.data.amountCents,
  })

  if (error) return { error: `Não foi possível salvar: ${error.message}` }
  if (!data) return { error: 'Meta não encontrada.' }

  revalidateGoalViews()
  return { success: 'Aporte do mês ajustado. O que falta foi redistribuído pelos outros meses.' }
}
