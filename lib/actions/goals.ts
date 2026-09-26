'use server'

import { revalidatePath } from 'next/cache'
import { currentUserId } from '@/lib/db/current-user'
import { createClient } from '@/lib/supabase/server'
import {
  archiveGoalSchema,
  contributionIdSchema,
  createContributionSchema,
  createGoalSchema,
  goalIdSchema,
  updateGoalSchema,
} from '@/lib/validation/goals'

/**
 * Escrita de metas e aportes.
 *
 * O que **não** existe aqui é um campo de progresso. O quanto já foi guardado é
 * `SUM(goal_contributions)`, lido de `v_goal_progress` (invariante 7). O app
 * antigo mantinha um acumulado gravado, e ele descolava da realidade no
 * primeiro aporte editado por fora.
 */

export interface GoalActionState {
  error?: string
  success?: string
}

function revalidateGoalViews(): void {
  revalidatePath('/metas')
  revalidatePath('/projecao')
}

function readGoalForm(formData: FormData) {
  return {
    name: formData.get('name'),
    targetAmountCents: formData.get('targetAmountCents'),
    targetDate: formData.get('targetDate') ?? '',
    monthlyContributionCents: formData.get('monthlyContributionCents') ?? '',
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

export async function deleteContribution(
  _prev: GoalActionState,
  formData: FormData,
): Promise<GoalActionState> {
  const parsed = contributionIdSchema.safeParse({ id: formData.get('id') })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Aporte inválido' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('goal_contributions')
    .delete()
    .eq('id', parsed.data.id)
    .select('id')

  if (error) return { error: `Não foi possível excluir: ${error.message}` }
  if (!data || data.length === 0) return { error: 'Aporte não encontrado.' }

  revalidateGoalViews()
  return { success: 'Aporte excluído.' }
}
