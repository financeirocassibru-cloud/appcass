import type { CreditAccountKind, EntryKind, EntrySource } from '@/lib/db/types'
import {
  buildBills,
  chargesOf,
  paymentOf,
  recurringCharges,
  type CreditAccount,
  type CreditBill,
  type CreditCharge,
} from '@/lib/finance/credit'
import { addMonths, type ISODate } from '@/lib/finance/date'
import type { Entry, RecurrenceFrequency, RecurringRule } from '@/lib/finance/types'
import { createClient } from '@/lib/supabase/server'

/**
 * Leitura de cartões, empréstimos e faturas — v1.0 — 2026-09-27 (Fase 13).
 *
 * As faturas não existem no banco: saem de `buildBills` (lib/finance/credit.ts) sobre três
 * leituras — os lançamentos financiados, os pagamentos de fatura e as contas fixas no cartão.
 * `getCreditLedger` é a única porta, e é ela que Início, Análise, Histórico, [+] e `/cartoes`
 * usam: se cada tela montasse as faturas por conta própria, o total da fatura no Início e na
 * tela do cartão divergiria na primeira mudança.
 *
 * Como nas demais queries, nenhum `eq('user_id', ...)`: a RLS restringe as linhas.
 */

const ACCOUNT_COLUMNS = `
  id, kind, name, limit_cents, closing_day, due_day, due_on, keywords, archived_at
` as const

interface AccountRow {
  id: string
  kind: CreditAccountKind
  name: string
  limit_cents: number | null
  closing_day: number | null
  due_day: number | null
  due_on: string | null
  keywords: string[]
  archived_at: string | null
}

function toAccount(row: AccountRow): CreditAccount {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    limitCents: row.limit_cents === null ? null : Number(row.limit_cents),
    closingDay: row.closing_day,
    dueDay: row.due_day,
    dueOn: row.due_on,
    keywords: row.keywords ?? [],
    archivedAt: row.archived_at,
  }
}

/** Cartões e empréstimos, ativos primeiro e por nome. */
export async function listCreditAccounts(includeArchived = false): Promise<CreditAccount[]> {
  const supabase = await createClient()
  let query = supabase.from('credit_accounts').select(ACCOUNT_COLUMNS)
  if (!includeArchived) query = query.is('archived_at', null)
  const { data, error } = await query.order('archived_at', { nullsFirst: true }).order('name')
  if (error) throw new Error(`Não foi possível ler os cartões: ${error.message}`)
  return (data ?? []).map(toAccount)
}

export async function getCreditAccount(id: string): Promise<CreditAccount | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('credit_accounts')
    .select(ACCOUNT_COLUMNS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`Não foi possível ler o cartão: ${error.message}`)
  return data ? toAccount(data) : null
}

const ENTRY_COLUMNS = `
  id, kind, occurred_on, description, amount_cents, category_id, is_settled,
  source, source_id, occurrence_key, installment_number, installment_total,
  credit_account_id, charge_first_due_on, charge_count, interest_cents
` as const

interface EntryRow {
  id: string
  kind: EntryKind
  occurred_on: string
  description: string
  amount_cents: number
  category_id: string | null
  is_settled: boolean
  source: EntrySource
  source_id: string | null
  occurrence_key: string | null
  installment_number: number | null
  installment_total: number | null
  credit_account_id: string | null
  charge_first_due_on: string | null
  charge_count: number
  interest_cents: number
}

function toEntry(row: EntryRow): Entry {
  return {
    id: row.id,
    kind: row.kind,
    occurredOn: row.occurred_on,
    description: row.description,
    amountCents: Number(row.amount_cents),
    categoryId: row.category_id,
    isSettled: row.is_settled,
    source: row.source,
    sourceId: row.source_id,
    occurrenceKey: row.occurrence_key,
    installmentNumber: row.installment_number,
    installmentTotal: row.installment_total,
    creditAccountId: row.credit_account_id,
    chargeFirstDueOn: row.charge_first_due_on,
    chargeCount: row.charge_count,
    interestCents: Number(row.interest_cents),
  }
}

const RULE_COLUMNS = `
  id, kind, description, amount_cents, category_id, frequency, day_of_month,
  starts_on, ends_on, is_active, credit_account_id
` as const

interface RuleRow {
  id: string
  kind: EntryKind
  description: string
  amount_cents: number
  category_id: string | null
  frequency: RecurrenceFrequency
  day_of_month: number | null
  starts_on: string
  ends_on: string | null
  is_active: boolean
  credit_account_id: string | null
}

function toRule(row: RuleRow): RecurringRule {
  return {
    id: row.id,
    kind: row.kind,
    description: row.description,
    amountCents: Number(row.amount_cents),
    categoryId: row.category_id,
    frequency: row.frequency,
    dayOfMonth: row.day_of_month,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    isActive: row.is_active,
    creditAccountId: row.credit_account_id,
  }
}

/** Teto de sanidade por leitura: uma pessoa, anos de cartão. */
const LIMIT = 5_000

/** Quanto adiante a conta fixa no cartão é prevista nas faturas. */
const RECURRING_HORIZON_MONTHS = 13

export interface CreditLedger {
  /** Todas as contas, inclusive arquivadas: uma arquivada ainda pode ter fatura aberta. */
  accounts: CreditAccount[]
  /** Todas as faturas de todas as contas, em ordem de vencimento. */
  bills: CreditBill[]
  /** Os lançamentos financiados, para o selo da lista e a tela do cartão. */
  fundedEntries: Entry[]
}

export const EMPTY_LEDGER: CreditLedger = { accounts: [], bills: [], fundedEntries: [] }

/**
 * As faturas de todas as contas, derivadas.
 *
 * Sem nenhuma conta cadastrada, sai na primeira leitura — quem não usa cartão não paga pelas
 * outras três.
 */
export async function getCreditLedger(today: ISODate): Promise<CreditLedger> {
  const accounts = await listCreditAccounts(true)
  if (accounts.length === 0) return EMPTY_LEDGER

  const supabase = await createClient()
  const [funded, paid, rules] = await Promise.all([
    supabase
      .from('entries')
      .select(ENTRY_COLUMNS)
      .not('credit_account_id', 'is', null)
      .order('occurred_on')
      .limit(LIMIT),
    supabase
      .from('entries')
      .select(ENTRY_COLUMNS)
      .eq('source', 'credit_bill')
      .order('occurred_on')
      .limit(LIMIT),
    supabase
      .from('recurring_rules')
      .select(RULE_COLUMNS)
      .not('credit_account_id', 'is', null)
      .eq('is_active', true),
  ])

  if (funded.error) throw new Error(`Não foi possível ler as compras no cartão: ${funded.error.message}`)
  if (paid.error) throw new Error(`Não foi possível ler os pagamentos de fatura: ${paid.error.message}`)
  if (rules.error) throw new Error(`Não foi possível ler as contas fixas no cartão: ${rules.error.message}`)

  const fundedEntries = (funded.data ?? []).map(toEntry)
  const payments = (paid.data ?? []).map(toEntry).map(paymentOf).filter((p) => p !== null)
  const cardRules = (rules.data ?? []).map(toRule)
  const horizon = addMonths(today, RECURRING_HORIZON_MONTHS)

  const bills: CreditBill[] = []
  for (const account of accounts) {
    const charges: CreditCharge[] = []
    const carried = new Set<ISODate>()
    for (const entry of fundedEntries) {
      if (entry.creditAccountId !== account.id) continue
      charges.push(...chargesOf(entry, account))
      if (entry.source === 'credit_carry' && entry.occurrenceKey) carried.add(entry.occurrenceKey.slice(0, 10))
    }
    for (const rule of cardRules) {
      charges.push(...recurringCharges(rule, account, today, horizon, fundedEntries))
    }
    bills.push(...buildBills({ account, charges, payments, carriedDueOns: carried, today }))
  }

  bills.sort((a, b) => (a.dueOn < b.dueOn ? -1 : a.dueOn > b.dueOn ? 1 : 0))
  return { accounts, bills, fundedEntries }
}

/** As faturas de uma conta, na ordem. */
export function billsOf(ledger: CreditLedger, accountId: string): CreditBill[] {
  return ledger.bills.filter((bill) => bill.accountId === accountId)
}

/** A fatura de uma conta num vencimento, se existir. */
export function findBill(ledger: CreditLedger, accountId: string, dueOn: ISODate): CreditBill | null {
  return ledger.bills.find((b) => b.accountId === accountId && b.dueOn === dueOn) ?? null
}
