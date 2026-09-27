'use server'

import { revalidatePath } from 'next/cache'
import { payBill } from '@/lib/credit/pay-bill'
import { currentUserId } from '@/lib/db/current-user'
import { findBill, getCreditLedger } from '@/lib/db/queries/credit'
import { nextDueAfter } from '@/lib/finance/credit'
import { todayISO } from '@/lib/finance/date'
import { createClient } from '@/lib/supabase/server'
import {
  archiveCreditAccountSchema,
  carryCreditBillSchema,
  creditAccountSchema,
  payCreditBillSchema,
  updateCreditAccountSchema,
} from '@/lib/validation/credit'
import { keywordsPatch } from '@/lib/validation/keywords'

/**
 * Escrita de cartões, empréstimos e faturas — v1.0 — 2026-09-27 (Fase 13).
 *
 * Como nas demais actions: Zod, a escrita, `revalidatePath` (invariante 5). Todo `update`
 * leva `.eq('id')` (o PostgREST recusa escrita sem WHERE, invariante 3) e `.select('id')` com
 * a checagem de linha casada (invariante 17). A conta de outra pessoa não é encontrada: a RLS
 * decide, e as RPCs são `security invoker`.
 *
 * Não existe "excluir cartão": a FK `on delete restrict` impede enquanto houver lançamento, e
 * um cartão sem uso pode ficar arquivado. Esconder é o que a pessoa quer; apagar a história da
 * fatura, não.
 */

export interface CreditActionState {
  error?: string
  success?: string
  /** O id da conta criada — o [+] a seleciona sem recarregar. */
  accountId?: string
}

function revalidateCreditViews(): void {
  revalidatePath('/cartoes', 'layout')
  revalidatePath('/')
  revalidatePath('/historico')
  revalidatePath('/analise')
  revalidatePath('/novo')
  revalidatePath('/novo/lancamentos')
  revalidatePath('/parcelas', 'layout')
}

function readAccount(formData: FormData) {
  return {
    kind: formData.get('kind'),
    name: formData.get('name'),
    limitCents: formData.get('limitCents'),
    closingDay: formData.get('closingDay'),
    dueDay: formData.get('dueDay'),
    dueOn: formData.get('dueOn'),
    keywords: formData.get('keywords'),
  }
}

export async function createCreditAccount(
  _prev: CreditActionState,
  formData: FormData,
): Promise<CreditActionState> {
  const parsed = creditAccountSchema.safeParse(readAccount(formData))
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }

  const v = parsed.data
  const userId = await currentUserId()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('credit_accounts')
    .insert({
      user_id: userId,
      kind: v.kind,
      name: v.name,
      limit_cents: v.limitCents,
      closing_day: v.kind === 'card' ? v.closingDay : null,
      due_day: v.dueDay,
      due_on: v.kind === 'loan' ? v.dueOn : null,
      ...keywordsPatch(v.keywords),
    })
    .select('id')
    .single()

  if (error) return { error: `Não foi possível salvar: ${error.message}` }

  revalidateCreditViews()
  return {
    success: v.kind === 'card' ? 'Cartão cadastrado.' : 'Empréstimo cadastrado.',
    accountId: data.id,
  }
}

export async function updateCreditAccount(
  _prev: CreditActionState,
  formData: FormData,
): Promise<CreditActionState> {
  const parsed = updateCreditAccountSchema.safeParse({ ...readAccount(formData), id: formData.get('id') })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }

  const v = parsed.data
  const supabase = await createClient()
  // O tipo (cartão/empréstimo) não muda: as faturas já calculadas dependem do ciclo dele.
  const { data, error } = await supabase
    .from('credit_accounts')
    .update({
      name: v.name,
      limit_cents: v.limitCents,
      closing_day: v.kind === 'card' ? v.closingDay : null,
      due_day: v.dueDay,
      due_on: v.kind === 'loan' ? v.dueOn : null,
      ...keywordsPatch(v.keywords),
    })
    .eq('id', v.id)
    .eq('kind', v.kind)
    .select('id')

  if (error) return { error: `Não foi possível salvar: ${error.message}` }
  if (!data || data.length === 0) return { error: 'Cartão ou empréstimo não encontrado.' }

  revalidateCreditViews()
  return { success: 'Salvo.' }
}

export async function archiveCreditAccount(
  _prev: CreditActionState,
  formData: FormData,
): Promise<CreditActionState> {
  const parsed = archiveCreditAccountSchema.safeParse({
    id: formData.get('id'),
    archive: formData.get('archive'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('credit_accounts')
    .update({ archived_at: parsed.data.archive ? new Date().toISOString() : null })
    .eq('id', parsed.data.id)
    .select('id')

  if (error) return { error: `Não foi possível salvar: ${error.message}` }
  if (!data || data.length === 0) return { error: 'Cartão ou empréstimo não encontrado.' }

  revalidateCreditViews()
  return { success: parsed.data.archive ? 'Arquivado.' : 'De volta à lista.' }
}

/**
 * Pagar a fatura — inteira, o mínimo ou qualquer parte. O que faltar rola para a fatura
 * seguinte quando o vencimento passa (rotativo), ou pode ser parcelado com `carryCreditBill`.
 */
export async function payCreditBill(
  _prev: CreditActionState,
  formData: FormData,
): Promise<CreditActionState> {
  const parsed = payCreditBillSchema.safeParse({
    accountId: formData.get('accountId'),
    dueOn: formData.get('dueOn'),
    amountCents: formData.get('amountCents'),
    paidOn: formData.get('paidOn'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }

  const ledger = await getCreditLedger(todayISO())
  const result = await payBill({ ledger, ...parsed.data })
  if (result.error) return { error: result.error }
  if (!result.id) return { error: 'Cartão ou empréstimo não encontrado.' }

  revalidateCreditViews()
  return { success: 'Pagamento registrado.' }
}

/**
 * Parcelar o restante da fatura: N parcelas de um valor. A diferença entre o total parcelado
 * e o restante são os juros do parcelamento. As parcelas vencem nas faturas seguintes.
 */
export async function carryCreditBill(
  _prev: CreditActionState,
  formData: FormData,
): Promise<CreditActionState> {
  const parsed = carryCreditBillSchema.safeParse({
    accountId: formData.get('accountId'),
    dueOn: formData.get('dueOn'),
    installments: formData.get('installments'),
    installmentCents: formData.get('installmentCents'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }

  const { accountId, dueOn, installments, installmentCents } = parsed.data
  const ledger = await getCreditLedger(todayISO())
  const account = ledger.accounts.find((a) => a.id === accountId)
  const bill = findBill(ledger, accountId, dueOn)
  if (!account || !bill) return { error: 'Fatura não encontrada.' }
  if (bill.remainingCents <= 0) return { error: 'Esta fatura não tem restante a parcelar.' }

  const totalCents = installments * installmentCents
  if (totalCents < bill.remainingCents) {
    return { error: 'As parcelas somam menos que o restante da fatura.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('carry_credit_bill', {
    p_account_id: accountId,
    p_due_on: dueOn,
    p_remaining_cents: bill.remainingCents,
    p_total_cents: totalCents,
    p_installments: installments,
    p_first_due_on: nextDueAfter(account, dueOn),
  })

  if (error) return { error: `Não foi possível parcelar: ${error.message}` }
  if (!data) return { error: 'Esta fatura já foi parcelada.' }

  revalidateCreditViews()
  return { success: `Restante parcelado em ${installments}×.` }
}
