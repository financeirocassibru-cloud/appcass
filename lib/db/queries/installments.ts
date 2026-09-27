import { getCreditLedger, type CreditLedger } from '@/lib/db/queries/credit'
import { entryCreditStatus } from '@/lib/finance/credit'
import { todayISO, type ISODate } from '@/lib/finance/date'
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
 *
 * v1.1 — 2026-09-27 (Fase 13): no parcelamento no cartão a parcela nunca fica liquidada — quem
 * a conclui é a fatura (migration 0021). Ali "paga" é a parcela cuja fatura foi paga, derivado
 * de `getCreditLedger` por `entryCreditStatus`, e não o `paid_count` da view.
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
  /** v1.1 — 2026-09-27: o cartão em que as parcelas são cobradas, ou `null`. */
  creditAccountId: string | null
}

const VIEW_COLUMNS =
  'plan_id, description, total_amount_cents, installments_count, paid_count, remaining_cents, next_due_on, credit_account_id'

/**
 * v1.1 — 2026-09-27: refaz o progresso dos planos no cartão pelas faturas. Uma leitura das
 * parcelas desses planos e o `ledger` — só quando há plano no cartão.
 */
async function withCardProgress(plans: InstallmentPlanProgress[]): Promise<InstallmentPlanProgress[]> {
  const onCard = plans.filter((plan) => plan.creditAccountId !== null)
  if (onCard.length === 0) return plans

  const supabase = await createClient()
  const [ledger, parcels] = await Promise.all([
    getCreditLedger(todayISO()),
    supabase
      .from('entries')
      .select('id, source_id, amount_cents, occurred_on, is_settled, credit_account_id')
      .eq('source', 'installment')
      .in(
        'source_id',
        onCard.map((plan) => plan.planId),
      ),
  ])
  if (parcels.error) throw new Error(`Falha ao ler parcelas no cartão: ${parcels.error.message}`)

  return plans.map((plan) => {
    if (plan.creditAccountId === null) return plan
    let paidCount = 0
    let remainingCents = 0
    let nextDueOn: ISODate | null = null
    for (const row of parcels.data ?? []) {
      if (row.source_id !== plan.planId) continue
      if (isParcelPaid(row, ledger)) {
        paidCount += 1
      } else {
        remainingCents += Number(row.amount_cents)
        if (nextDueOn === null || row.occurred_on < nextDueOn) nextDueOn = row.occurred_on
      }
    }
    return { ...plan, paidCount, remainingCents, nextDueOn }
  })
}

/** Paga: liquidada (as que entraram já pagas) ou, no cartão, com a fatura resolvida. */
function isParcelPaid(
  row: { id: string; is_settled: boolean; credit_account_id: string | null },
  ledger: CreditLedger,
): boolean {
  if (row.is_settled) return true
  if (!row.credit_account_id) return false
  return entryCreditStatus(row.id, ledger.bills)?.isPaid ?? false
}

export async function listInstallmentPlans(): Promise<InstallmentPlanProgress[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('v_installment_progress')
    .select(VIEW_COLUMNS)
    .order('next_due_on', { ascending: true, nullsFirst: false })

  if (error) throw new Error(`Falha ao listar parcelamentos: ${error.message}`)

  return withCardProgress((data ?? []).filter(hasPlanId).map(toProgress))
}

export async function getInstallmentPlan(id: string): Promise<InstallmentPlanProgress | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('v_installment_progress')
    .select(VIEW_COLUMNS)
    .eq('plan_id', id)
    .maybeSingle()

  if (error) throw new Error(`Falha ao buscar parcelamento: ${error.message}`)
  if (!data || !hasPlanId(data)) return null

  const [plan] = await withCardProgress([toProgress(data)])
  return plan ?? null
}

/**
 * As palavras-chave de um plano (migration 0019). v1.0 — 2026-09-27.
 *
 * Fora de `getInstallmentPlan` porque a view de progresso (0007) não tem a coluna, e
 * views aplicadas não se editam (invariante 16). Uma leitura a mais, numa tela só.
 */
export async function getInstallmentKeywords(id: string): Promise<string[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('installment_plans')
    .select('keywords')
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`Falha ao buscar parcelamento: ${error.message}`)
  return data?.keywords ?? []
}

interface ViewRow {
  plan_id: string | null
  description: string | null
  total_amount_cents: number | null
  installments_count: number | null
  paid_count: number | null
  remaining_cents: number | null
  next_due_on: string | null
  credit_account_id: string | null
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
    creditAccountId: row.credit_account_id,
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
  /** v1.1 — 2026-09-27: no cartão, o vencimento da fatura em que a parcela cai. */
  billDueOn: ISODate | null
}

/**
 * As parcelas de um plano, em ordem.
 *
 * v1.1 — 2026-09-27: no cartão, `isSettled` é "a fatura desta parcela foi paga".
 *
 * Ordena por `installment_number` e não por data: se alguém editar a data de
 * uma parcela no extrato, a numeração continua sendo a ordem que a pessoa
 * entende.
 */
export async function listPlanInstallments(planId: string): Promise<InstallmentRow[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('entries')
    .select(
      'id, installment_number, installment_total, amount_cents, occurred_on, is_settled, credit_account_id, charge_first_due_on',
    )
    .eq('source', 'installment')
    .eq('source_id', planId)
    .order('installment_number', { ascending: true })

  if (error) throw new Error(`Falha ao listar parcelas: ${error.message}`)

  const rows = data ?? []
  const ledger = rows.some((row) => row.credit_account_id) ? await getCreditLedger(todayISO()) : null

  return rows.map((row) => ({
    id: row.id,
    number: row.installment_number ?? 0,
    total: row.installment_total ?? 0,
    amountCents: Number(row.amount_cents),
    dueOn: row.occurred_on,
    isSettled: ledger ? isParcelPaid(row, ledger) : row.is_settled,
    billDueOn: row.charge_first_due_on,
  }))
}
