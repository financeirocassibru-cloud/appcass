import type { ISODate } from '@/lib/finance/date'
import { createClient } from '@/lib/supabase/server'

/**
 * Leitura de parcelamentos.
 *
 * O progresso vem da view `v_installment_progress`, que conta as parcelas
 * liquidadas em `entries` — invariante 7, estado derivado é derivado. O app
 * antigo guardava um campo `parcelasPagas` que descolava da realidade assim que
 * alguém editava um lançamento por fora.
 *
 * Como toda view, ela não tem `not null`: os totais chegam como `number | null`.
 * A conversão para o tipo do domínio acontece aqui, uma vez.
 */

export interface InstallmentPlanProgress {
  planId: string
  description: string
  totalAmountCents: number
  installmentsCount: number
  /** Quantas já foram liquidadas. */
  paidCount: number
  /** Soma do que ainda não foi pago. */
  remainingCents: number
  nextDueOn: ISODate | null
}

export async function listInstallmentPlans(): Promise<InstallmentPlanProgress[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('v_installment_progress')
    .select('plan_id, description, total_amount_cents, installments_count, paid_count, remaining_cents, next_due_on')
    .order('next_due_on', { ascending: true, nullsFirst: false })

  if (error) throw new Error(`Falha ao listar parcelamentos: ${error.message}`)

  return (data ?? []).filter(hasPlanId).map(toProgress)
}

export async function getInstallmentPlan(id: string): Promise<InstallmentPlanProgress | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('v_installment_progress')
    .select('plan_id, description, total_amount_cents, installments_count, paid_count, remaining_cents, next_due_on')
    .eq('plan_id', id)
    .maybeSingle()

  if (error) throw new Error(`Falha ao buscar parcelamento: ${error.message}`)
  if (!data || !hasPlanId(data)) return null

  return toProgress(data)
}

interface ViewRow {
  plan_id: string | null
  description: string | null
  total_amount_cents: number | null
  installments_count: number | null
  paid_count: number | null
  remaining_cents: number | null
  next_due_on: string | null
}

/** A view não tem `not null`; sem `plan_id` a linha não serve para nada. */
function hasPlanId(row: ViewRow): row is ViewRow & { plan_id: string } {
  return row.plan_id !== null
}

function toProgress(row: ViewRow & { plan_id: string }): InstallmentPlanProgress {
  return {
    planId: row.plan_id,
    description: row.description ?? '',
    totalAmountCents: Number(row.total_amount_cents ?? 0),
    installmentsCount: Number(row.installments_count ?? 0),
    paidCount: Number(row.paid_count ?? 0),
    remainingCents: Number(row.remaining_cents ?? 0),
    nextDueOn: row.next_due_on,
  }
}

/** Uma parcela na tela de detalhe. */
export interface InstallmentRow {
  id: string
  number: number
  total: number
  amountCents: number
  dueOn: ISODate
  isSettled: boolean
}

/**
 * As parcelas de um plano, em ordem.
 *
 * Ordena por `installment_number` e não por data: se alguém editar a data de
 * uma parcela no extrato, a numeração continua sendo a ordem que a pessoa
 * entende.
 */
export async function listPlanInstallments(planId: string): Promise<InstallmentRow[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('entries')
    .select('id, installment_number, installment_total, amount_cents, occurred_on, is_settled')
    .eq('source', 'installment')
    .eq('source_id', planId)
    .order('installment_number', { ascending: true })

  if (error) throw new Error(`Falha ao listar parcelas: ${error.message}`)

  return (data ?? []).map((row) => ({
    id: row.id,
    number: row.installment_number ?? 0,
    total: row.installment_total ?? 0,
    amountCents: Number(row.amount_cents),
    dueOn: row.occurred_on,
    isSettled: row.is_settled,
  }))
}
