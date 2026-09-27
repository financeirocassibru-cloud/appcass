'use server'

import { revalidatePath } from 'next/cache'
import { planInstallments } from '@/lib/finance/installments'
import { createClient } from '@/lib/supabase/server'
import {
  createInstallmentSchema,
  installmentPlanIdSchema,
  setPaidCountSchema,
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
 *
 * v1.1 — 2026-09-27: parcelamento em andamento. `paidCount` vai para `p_paid_count`
 * (migration 0017), e as primeiras nascem liquidadas na data de cada uma, na mesma transação.
 * `/novo/lancamentos` passou a ser revalidado, porque o plano aparece lá.
 *
 * v1.2 — 2026-09-27: `setInstallmentsPaid`, para declarar quantas já foram pagas num
 * parcelamento que já está no app (função `set_installments_paid`, migration 0017).
 */

export interface InstallmentActionState {
  error?: string
  success?: string
}

function revalidateInstallmentViews(): void {
  revalidatePath('/parcelas')
  revalidatePath('/')
  revalidatePath('/historico')
  revalidatePath('/novo')
  revalidatePath('/novo/lancamentos')
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
    paidCount: formData.get('paidCount'),
    anchorDay: formData.get('anchorDay'),
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
    anchorDay: parsed.data.anchorDay ?? undefined,
  })

  const paidCount = parsed.data.paidCount ?? 0
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
    p_paid_count: paidCount,
  })

  if (error) return { error: `Não foi possível criar: ${error.message}` }
  if (!data) return { error: 'Não foi possível criar o parcelamento.' }

  revalidateInstallmentViews()
  return {
    success:
      paidCount > 0
        ? `Parcelamento criado em ${parsed.data.installmentsCount}x, com ${paidCount} já ${paidCount === 1 ? 'paga' : 'pagas'}.`
        : `Parcelamento criado em ${parsed.data.installmentsCount}x.`,
  }
}

/**
 * Declara quantas parcelas já foram pagas: 1..N liquidadas, as seguintes pendentes.
 *
 * v1.0 — 2026-09-27. Via RPC porque cada parcela é liquidada na **própria** data — as já pagas
 * guardam a delas — e um `update` do supabase-js só grava o mesmo valor em todas as linhas. A
 * função recusa plano invisível pela RLS (`no_data_found`) e N fora de 0..total.
 */
export async function setInstallmentsPaid(
  _prev: InstallmentActionState,
  formData: FormData,
): Promise<InstallmentActionState> {
  const parsed = setPaidCountSchema.safeParse({
    id: formData.get('id'),
    paidCount: formData.get('paidCount'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('set_installments_paid', {
    p_plan_id: parsed.data.id,
    p_paid_count: parsed.data.paidCount,
  })

  if (error) return { error: `Não foi possível atualizar: ${error.message}` }

  revalidateInstallmentViews()
  revalidatePath(`/parcelas/${parsed.data.id}`)

  const changed = Number(data ?? 0)
  return {
    success:
      changed === 0
        ? 'Nada mudou: já estava assim.'
        : `${parsed.data.paidCount} ${parsed.data.paidCount === 1 ? 'parcela paga' : 'parcelas pagas'} — ${changed} ${changed === 1 ? 'parcela atualizada' : 'parcelas atualizadas'}.`,
  }
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
