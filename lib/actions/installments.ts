'use server'

import { revalidatePath } from 'next/cache'
import { planInstallments } from '@/lib/finance/installments'
import { createClient } from '@/lib/supabase/server'
import {
  createInstallmentSchema,
  installmentPlanIdSchema,
} from '@/lib/validation/installments'

/**
 * Escrita de parcelamentos.
 *
 * Ao contrário da conta fixa, aqui as N parcelas viram lançamentos reais no ato
 * da criação: a dívida já existe inteira no momento da compra. É o que faz
 * "parcelas pagas" ser uma contagem de linhas liquidadas em vez de um contador
 * mutável — o `parcelasPagas` do app antigo descolava da realidade assim que
 * alguém editava um lançamento por fora.
 *
 * O rateio sai de `planInstallments()`, que usa `splitCents()` e tem property
 * test provando que a soma das partes bate com o total. A gravação vai para a
 * função `create_installment_plan` (migration 0010), que grava plano e parcelas
 * numa transação só **e confere a soma de novo** — o cliente calcula, o banco
 * não acredita.
 */

export interface InstallmentActionState {
  error?: string
  success?: string
}

function revalidateInstallmentViews(): void {
  revalidatePath('/parcelas')
  revalidatePath('/')
  revalidatePath('/lancamentos')
}

export async function createInstallmentPlan(
  _prev: InstallmentActionState,
  formData: FormData,
): Promise<InstallmentActionState> {
  const parsed = createInstallmentSchema.safeParse({
    description: formData.get('description'),
    totalAmountCents: formData.get('totalAmountCents'),
    installmentsCount: formData.get('installmentsCount'),
    firstDueOn: formData.get('firstDueOn'),
    categoryId: formData.get('categoryId') ?? '',
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  // O `id` do plano ainda não existe — ele nasce dentro da função do banco. O
  // motor puro só precisa dele para montar chaves que aqui não usamos, então
  // um placeholder serve e nada dele é gravado.
  const parcels = planInstallments({
    id: 'pendente',
    description: parsed.data.description,
    categoryId: parsed.data.categoryId,
    totalAmountCents: parsed.data.totalAmountCents,
    installmentsCount: parsed.data.installmentsCount,
    firstDueOn: parsed.data.firstDueOn,
  })

  const supabase = await createClient()

  const { data, error } = await supabase.rpc('create_installment_plan', {
    p_description: parsed.data.description,
    p_total_amount_cents: parsed.data.totalAmountCents,
    p_installments_count: parsed.data.installmentsCount,
    p_first_due_on: parsed.data.firstDueOn,
    p_installments: parcels.map((parcel) => ({
      number: parcel.occurrenceKey,
      amount_cents: parcel.amountCents,
      due_on: parcel.dueOn,
      description: parcel.description,
    })),
    // Omitido quando não há categoria: o parâmetro tem `default null` no banco,
    // e é assim que "sem categoria" se exprime no tipo gerado.
    ...(parsed.data.categoryId === null ? {} : { p_category_id: parsed.data.categoryId }),
  })

  if (error) return { error: `Não foi possível criar: ${error.message}` }
  if (!data) return { error: 'Não foi possível criar o parcelamento.' }

  revalidateInstallmentViews()
  return { success: `Parcelamento criado em ${parsed.data.installmentsCount}x.` }
}

/**
 * Exclui o parcelamento.
 *
 * Remove as parcelas **ainda não pagas** e o plano; as já liquidadas continuam
 * no extrato, porque são história e apagá-las mudaria o saldo de meses
 * fechados. Transacional pelo mesmo motivo da criação: apagar o plano e deixar
 * parcelas órfãs seria pior que não apagar nada.
 */
export async function deleteInstallmentPlan(
  _prev: InstallmentActionState,
  formData: FormData,
): Promise<InstallmentActionState> {
  const parsed = installmentPlanIdSchema.safeParse({ id: formData.get('id') })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Parcelamento inválido' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('delete_installment_plan', {
    p_plan_id: parsed.data.id,
  })

  if (error) return { error: `Não foi possível excluir: ${error.message}` }

  revalidateInstallmentViews()

  const removed = Number(data ?? 0)
  return {
    success:
      removed === 0
        ? 'Parcelamento excluído. As parcelas já pagas continuam no extrato.'
        : `Parcelamento excluído: ${removed} ${
            removed === 1 ? 'parcela pendente removida' : 'parcelas pendentes removidas'
          }. As já pagas continuam no extrato.`,
  }
}
