import { listAllCategories, type Category } from '@/lib/db/queries/categories'
import { getCurrentBalance } from '@/lib/db/queries/balance'
import { billsOf, getCreditLedger } from '@/lib/db/queries/credit'
import { listGoalPlanOverrides, listGoals, type GoalProgress } from '@/lib/db/queries/goals'
import { getScenario } from '@/lib/db/queries/scenarios'
import { toCreditOptions, type CreditAccount, type CreditOption } from '@/lib/finance/credit'
import { todayISO, type ISODate } from '@/lib/finance/date'
import {
  buildCardSheet,
  buildSheet,
  type CardSheet,
  type Sheet,
  type SheetEntry,
  type SheetGrouping,
  type SheetLabels,
  type SheetSort,
} from '@/lib/finance/sheet'
import type { EntryKind, RecurrenceFrequency, RecurringRule } from '@/lib/finance/types'
import { createClient } from '@/lib/supabase/server'

/**
 * A leitura da planilha — v1.0 — 28/09/2026 (Fase 14).
 *
 * As mesmas fontes da Análise (`getWindow`): lançamentos, contas fixas, metas com os meses
 * fixados, faturas derivadas por `getCreditLedger` e o cenário. A montagem é de
 * `buildSheet`/`buildCardSheet` (`lib/finance/sheet.ts`), que são puras e testadas; aqui só se
 * lê. Junto vão os dados que as janelas de edição da tela precisam (regras com palavras-chave,
 * planos com categoria, metas com progresso), para abrir sem esperar outra ida ao banco.
 */

const PAGE = 1_000

/** As colunas de um lançamento para a planilha: as da projeção mais o instante de criação. */
const ENTRY_COLUMNS = `
  id, kind, occurred_on, description, amount_cents, category_id,
  is_settled, source, source_id, occurrence_key,
  installment_number, installment_total,
  credit_account_id, charge_first_due_on, charge_count, interest_cents, created_at
` as const

interface EntryRow {
  id: string
  kind: EntryKind
  occurred_on: string
  description: string
  amount_cents: number
  category_id: string | null
  is_settled: boolean
  source: SheetEntry['source']
  source_id: string | null
  occurrence_key: string | null
  installment_number: number | null
  installment_total: number | null
  credit_account_id: string | null
  charge_first_due_on: string | null
  charge_count: number
  interest_cents: number
  created_at: string
}

function toSheetEntry(row: EntryRow): SheetEntry {
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
    createdAt: row.created_at,
  }
}

/**
 * Os lançamentos de `[from, to]` e os pendentes vencidos antes de `from`.
 *
 * Paginado: o PostgREST corta cada resposta em 1.000 linhas, e um ano de lançamentos passa
 * disso com folga para quem importa extrato — sem paginar, a planilha perderia meses inteiros
 * em silêncio.
 */
async function listSheetEntries(from: ISODate, to: ISODate): Promise<SheetEntry[]> {
  const supabase = await createClient()
  const rows: EntryRow[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from('entries')
      .select(ENTRY_COLUMNS)
      .gte('occurred_on', from)
      .lte('occurred_on', to)
      .order('occurred_on')
      .order('id')
      .range(offset, offset + PAGE - 1)
    if (error) throw new Error(`Falha ao ler os lançamentos da planilha: ${error.message}`)
    rows.push(...((data ?? []) as EntryRow[]))
    if (!data || data.length < PAGE) break
  }

  const { data: overdue, error } = await supabase
    .from('entries')
    .select(ENTRY_COLUMNS)
    .eq('is_settled', false)
    .lt('occurred_on', from)
    .limit(PAGE)
  if (error) throw new Error(`Falha ao ler as contas vencidas: ${error.message}`)

  return [...rows, ...((overdue ?? []) as EntryRow[])].map(toSheetEntry)
}

/** A regra na forma do formulário de edição (`RecurringForm`). */
export type SheetRule = RecurringRule & { keywords: string[] }

async function listSheetRules(): Promise<SheetRule[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('recurring_rules')
    .select(
      'id, kind, description, amount_cents, category_id, frequency, day_of_month, starts_on, ends_on, is_active, credit_account_id, keywords',
    )
  if (error) throw new Error(`Falha ao ler as contas fixas: ${error.message}`)
  return (data ?? []).map((row) => ({
    id: row.id,
    kind: row.kind,
    description: row.description,
    amountCents: Number(row.amount_cents),
    categoryId: row.category_id,
    frequency: row.frequency as RecurrenceFrequency,
    dayOfMonth: row.day_of_month,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    isActive: row.is_active,
    creditAccountId: row.credit_account_id,
    keywords: row.keywords ?? [],
  }))
}

/** O plano na forma da janela "editar parcelamento". */
export interface SheetPlan {
  id: string
  description: string
  categoryId: string | null
  totalAmountCents: number
  installmentsCount: number
  creditAccountId: string | null
}

async function listSheetPlans(): Promise<SheetPlan[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('installment_plans')
    .select('id, description, category_id, total_amount_cents, installments_count, credit_account_id')
  if (error) throw new Error(`Falha ao ler os parcelamentos: ${error.message}`)
  return (data ?? []).map((row) => ({
    id: row.id,
    description: row.description,
    categoryId: row.category_id,
    totalAmountCents: Number(row.total_amount_cents),
    installmentsCount: row.installments_count,
    creditAccountId: row.credit_account_id,
  }))
}

/** Tudo que a tela precisa além da grade: o que as janelas de edição abrem. */
export interface SheetContext {
  today: ISODate
  categories: Category[]
  rules: SheetRule[]
  plans: SheetPlan[]
  goals: GoalProgress[]
  creditAccounts: CreditOption[]
  accounts: CreditAccount[]
}

function labelsOf(context: Omit<SheetContext, 'today' | 'creditAccounts'>): SheetLabels {
  return {
    categories: Object.fromEntries(context.categories.map((c) => [c.id, c.name])),
    rules: Object.fromEntries(context.rules.map((r) => [r.id, r.description])),
    plans: Object.fromEntries(context.plans.map((p) => [p.id, p.description])),
    goals: Object.fromEntries(context.goals.map((g) => [g.id, g.name])),
    accounts: Object.fromEntries(context.accounts.map((a) => [a.id, { name: a.name, kind: a.kind }])),
  }
}

export interface SheetOptions {
  from: ISODate
  to: ISODate
  grouping: SheetGrouping
  sort: SheetSort
  scenarioId?: string
  today?: ISODate
}

/** A planilha principal e o contexto das janelas de edição. */
export async function getSheet(options: SheetOptions): Promise<{ sheet: Sheet; context: SheetContext }> {
  const today = options.today ?? todayISO()
  // O saldo do fim do mês precisa dos liquidados entre o mês e hoje, mesmo fora das colunas.
  const lo = options.from < today ? options.from : today
  const hi = options.to > today ? options.to : today

  const [entries, rules, goals, overrides, plans, categories, ledger, balance, scenario] = await Promise.all([
    listSheetEntries(lo, hi),
    listSheetRules(),
    listGoals(true),
    listGoalPlanOverrides(),
    listSheetPlans(),
    listAllCategories(),
    getCreditLedger(today),
    getCurrentBalance(today),
    options.scenarioId ? getScenario(options.scenarioId) : Promise.resolve(null),
  ])

  const context: SheetContext = {
    today,
    categories,
    rules,
    plans,
    goals,
    creditAccounts: toCreditOptions(ledger.accounts, ledger.bills, true),
    accounts: ledger.accounts,
  }

  const sheet = buildSheet({
    from: options.from,
    to: options.to,
    today,
    entries,
    // Como em `listActiveRecurringRules`: só as ativas geram previsão.
    recurringRules: rules.filter((rule) => rule.isActive),
    goals: goals
      .filter((goal) => goal.archivedAt === null)
      .map((goal) => ({ ...goal, planOverrides: overrides.get(goal.id) ?? [] })),
    bills: ledger.bills,
    labels: labelsOf(context),
    scenario,
    currentBalanceCents: balance.currentCents,
    historyStartsOn: balance.openingBalanceOn,
    grouping: options.grouping,
    sort: options.sort,
  })

  return { sheet, context }
}

/** A planilha de um cartão ou empréstimo; `null` quando a conta não existe (ou é de outra pessoa). */
export async function getCardSheet(
  accountId: string,
  options: Omit<SheetOptions, 'scenarioId'>,
): Promise<{ sheet: CardSheet; account: CreditAccount; context: SheetContext } | null> {
  const today = options.today ?? todayISO()
  const [ledger, rules, goals, plans, categories] = await Promise.all([
    getCreditLedger(today),
    listSheetRules(),
    listGoals(true),
    listSheetPlans(),
    listAllCategories(),
  ])
  const account = ledger.accounts.find((a) => a.id === accountId)
  if (!account) return null

  // O instante de criação das compras desta conta, para "ordenar por data de lançamento". O
  // ledger não o lê porque ninguém mais precisa dele.
  const ids = ledger.fundedEntries.filter((e) => e.creditAccountId === accountId).map((e) => e.id)
  const createdAt = new Map<string, string>()
  if (ids.length > 0) {
    const supabase = await createClient()
    for (let offset = 0; offset < ids.length; offset += 200) {
      const { data, error } = await supabase
        .from('entries')
        .select('id, created_at')
        .in('id', ids.slice(offset, offset + 200))
      if (error) throw new Error(`Falha ao ler as compras do cartão: ${error.message}`)
      for (const row of data ?? []) createdAt.set(row.id, row.created_at)
    }
  }

  const context: SheetContext = {
    today,
    categories,
    rules,
    plans,
    goals,
    creditAccounts: toCreditOptions(ledger.accounts, ledger.bills, true),
    accounts: ledger.accounts,
  }

  const sheet = buildCardSheet({
    from: options.from,
    to: options.to,
    today,
    bills: billsOf(ledger, accountId),
    fundedEntries: ledger.fundedEntries.map((e) => ({ ...e, createdAt: createdAt.get(e.id) ?? null })),
    labels: labelsOf(context),
    grouping: options.grouping,
    sort: options.sort,
  })

  return { sheet, account, context }
}
