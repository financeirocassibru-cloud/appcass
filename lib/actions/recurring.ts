'use server'

import { revalidatePath } from 'next/cache'
import { currentUserId } from '@/lib/db/current-user'
import { createClient } from '@/lib/supabase/server'
import {
  createRecurringSchema,
  materializeSchema,
  recurringIdSchema,
  toggleRecurringSchema,
  updateRecurringSchema,
} from '@/lib/validation/recurring'

/**
 * Escrita de contas fixas.
 *
 * O que **não** acontece aqui é o mais importante: criar ou editar uma regra não
 * grava nada em `entries`. A regra é uma regra; a ocorrência de um mês só vira
 * lançamento quando é liquidada, por `materializeRecurring`. No app antigo o
 * custo fixo era copiado para dentro de cada ciclo, e as duas cópias divergiam
 * na primeira edição.
 *
 * Consequência que a tela precisa dizer em voz alta: **editar o valor não
 * reescreve o passado.** As ocorrências já liquidadas são linhas independentes,
 * e continuam com o valor que tinham no dia.
 */

export interface RecurringActionState {
  error?: string
  success?: string
}

function revalidateRecurringViews(): void {
  revalidatePath('/compromissos')
  revalidatePath('/')
  revalidatePath('/lancamentos')
}

/** Os campos do formulário, na forma que os schemas esperam. */
function readForm(formData: FormData) {
  return {
    kind: formData.get('kind'),
    description: formData.get('description'),
    amountCents: formData.get('amountCents'),
    categoryId: formData.get('categoryId') ?? '',
    frequency: formData.get('frequency'),
    dayOfMonth: formData.get('dayOfMonth') ?? '',
    startsOn: formData.get('startsOn'),
    endsOn: formData.get('endsOn') ?? '',
  }
}

export async function createRecurring(
  _prev: RecurringActionState,
  formData: FormData,
): Promise<RecurringActionState> {
  const parsed = createRecurringSchema.safeParse(readForm(formData))
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  const userId = await currentUserId()
  const supabase = await createClient()

  const { error } = await supabase.from('recurring_rules').insert({
    // A RLS exige `user_id` no `with check`; a policy restringe a linha, não a
    // preenche.
    user_id: userId,
    kind: parsed.data.kind,
    description: parsed.data.description,
    amount_cents: parsed.data.amountCents,
    category_id: parsed.data.categoryId,
    frequency: parsed.data.frequency,
    day_of_month: parsed.data.dayOfMonth,
    starts_on: parsed.data.startsOn,
    ends_on: parsed.data.endsOn,
  })

  if (error) return { error: `Não foi possível salvar: ${error.message}` }

  revalidateRecurringViews()
  return { success: 'Conta fixa criada.' }
}

export async function updateRecurring(
  _prev: RecurringActionState,
  formData: FormData,
): Promise<RecurringActionState> {
  const parsed = updateRecurringSchema.safeParse({
    ...readForm(formData),
    id: formData.get('id'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  const supabase = await createClient()

  // `.select()` conferido (invariante 17): o supabase-js devolve sucesso quando
  // o update não casa linha nenhuma, e aqui isso significaria id inexistente ou
  // de outra pessoa — a RLS filtra em silêncio.
  const { data, error } = await supabase
    .from('recurring_rules')
    .update({
      kind: parsed.data.kind,
      description: parsed.data.description,
      amount_cents: parsed.data.amountCents,
      category_id: parsed.data.categoryId,
      frequency: parsed.data.frequency,
      day_of_month: parsed.data.dayOfMonth,
      starts_on: parsed.data.startsOn,
      ends_on: parsed.data.endsOn,
    })
    .eq('id', parsed.data.id)
    .select('id')

  if (error) return { error: `Não foi possível salvar: ${error.message}` }
  if (!data || data.length === 0) return { error: 'Conta fixa não encontrada.' }

  revalidateRecurringViews()
  return { success: 'Conta fixa atualizada.' }
}

/**
 * Ativa ou desativa.
 *
 * Desativar é o caminho normal para "não quero mais essa conta": a regra para de
 * gerar ocorrências e o histórico fica intacto. Excluir é para quem criou errado.
 */
export async function toggleRecurringActive(
  _prev: RecurringActionState,
  formData: FormData,
): Promise<RecurringActionState> {
  const parsed = toggleRecurringSchema.safeParse({
    id: formData.get('id'),
    isActive: formData.get('isActive'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('recurring_rules')
    .update({ is_active: parsed.data.isActive })
    .eq('id', parsed.data.id)
    .select('id')

  if (error) return { error: `Não foi possível atualizar: ${error.message}` }
  if (!data || data.length === 0) return { error: 'Conta fixa não encontrada.' }

  revalidateRecurringViews()
  return { success: parsed.data.isActive ? 'Conta fixa reativada.' : 'Conta fixa desativada.' }
}

/**
 * Exclui a regra.
 *
 * As ocorrências já liquidadas **permanecem**: são história, e apagá-las mudaria
 * saldos de meses fechados. O `source_id` delas vira uma referência solta, o que
 * é intencional — não há FK, justamente para a regra poder morrer sem levar o
 * passado junto (está dito em `0003_tables.sql`).
 */
export async function deleteRecurring(
  _prev: RecurringActionState,
  formData: FormData,
): Promise<RecurringActionState> {
  const parsed = recurringIdSchema.safeParse({ id: formData.get('id') })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Conta fixa inválida' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('recurring_rules')
    .delete()
    .eq('id', parsed.data.id)
    .select('id')

  if (error) return { error: `Não foi possível excluir: ${error.message}` }
  if (!data || data.length === 0) return { error: 'Conta fixa não encontrada.' }

  revalidateRecurringViews()
  return { success: 'Conta fixa excluída. Os lançamentos já pagos continuam no extrato.' }
}

/**
 * Liquida uma ocorrência: cria o lançamento correspondente.
 *
 * Chama `materialize_recurring_occurrence` (migration 0009) em vez de inserir
 * daqui. O motivo é a invariante 8: o índice `entries_generated_uniq` é parcial,
 * e um `on conflict` só infere índice parcial repetindo o predicado — coisa que
 * o `upsert()` do supabase-js não emite. A idempotência mora no banco, onde duas
 * abas clicando ao mesmo tempo também esbarram nela.
 *
 * A função devolve `null` quando a ocorrência já existia. Isso é sucesso, não
 * erro: o estado desejado — um lançamento, exatamente um — foi alcançado.
 */
export async function materializeRecurring(
  _prev: RecurringActionState,
  formData: FormData,
): Promise<RecurringActionState> {
  const parsed = materializeSchema.safeParse({
    ruleId: formData.get('ruleId'),
    occursOn: formData.get('occursOn'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  const supabase = await createClient()

  const { data, error } = await supabase.rpc('materialize_recurring_occurrence', {
    p_rule_id: parsed.data.ruleId,
    p_occurs_on: parsed.data.occursOn,
    p_settled: true,
  })

  if (error) return { error: `Não foi possível marcar como pago: ${error.message}` }

  revalidateRecurringViews()
  // `data === null` significa "já estava materializada" — o resultado é o mesmo.
  return { success: data === null ? 'Essa ocorrência já estava paga.' : 'Marcado como pago.' }
}
