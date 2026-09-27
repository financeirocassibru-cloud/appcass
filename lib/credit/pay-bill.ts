import 'server-only'

import { findBill, type CreditLedger } from '@/lib/db/queries/credit'
import { excessInterestCents } from '@/lib/finance/credit'
import type { ISODate } from '@/lib/finance/date'
import { createClient } from '@/lib/supabase/server'

/**
 * Pagar uma fatura — v1.0 — 2026-09-27 (Fase 13).
 *
 * Um lugar só para os dois caminhos que pagam fatura: o botão "Pagar" (lib/actions/credit.ts)
 * e a linha do extrato conectada à fatura (lib/actions/import.ts). Fora de `lib/actions` de
 * propósito: um arquivo `'use server'` expõe cada função exportada como endpoint, e esta
 * recebe o `ledger` já montado — não é algo que o navegador deva poder chamar.
 *
 * Dois passos, nesta ordem:
 *
 * 1. As contas fixas no cartão que caem nesta fatura e ainda são só previsão viram lançamento
 *    (`materialize_recurring_occurrence`, idempotente — invariante 8). É o momento em que a
 *    assinatura do mês entra no Histórico, na categoria dela: a fatura paga é a prova de que a
 *    cobrança aconteceu. O total da fatura não muda — a cobrança prevista e a materializada
 *    caem no mesmo vencimento, pela mesma regra (`credit_first_due`).
 * 2. O pagamento (`pay_credit_bill`), com `interest_cents` = o que passou do restante — os
 *    juros do rotativo, que as views contam como "Juros e encargos".
 */
export async function payBill(input: {
  ledger: CreditLedger
  accountId: string
  dueOn: ISODate
  amountCents: number
  paidOn: ISODate
  importKey?: string
  importBatchId?: string
}): Promise<{ id: string | null; error?: string }> {
  const supabase = await createClient()
  const bill = findBill(input.ledger, input.accountId, input.dueOn)

  for (const charge of bill?.charges ?? []) {
    if (charge.ruleId === null) continue
    const { error } = await supabase.rpc('materialize_recurring_occurrence', {
      p_rule_id: charge.ruleId,
      p_occurs_on: charge.occurredOn,
      p_settled: false,
    })
    if (error) return { id: null, error: `Não foi possível lançar ${charge.description}: ${error.message}` }
  }

  const { data, error } = await supabase.rpc('pay_credit_bill', {
    p_account_id: input.accountId,
    p_due_on: input.dueOn,
    p_amount_cents: input.amountCents,
    p_paid_on: input.paidOn,
    p_interest_cents: excessInterestCents(bill, input.amountCents),
    ...(input.importKey ? { p_import_key: input.importKey } : {}),
    ...(input.importBatchId ? { p_import_batch_id: input.importBatchId } : {}),
  })
  if (error) return { id: null, error: `Não foi possível pagar a fatura: ${error.message}` }
  return { id: data ?? null }
}
