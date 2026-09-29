import { billLabel, isBillDue, isCashEntry } from './cash'
import type { CreditBill } from './credit'
import {
  addMonths,
  clampDayToMonth,
  endOfMonth,
  monthKey,
  parseISODate,
  startOfMonth,
  toISODate,
  type ISODate,
} from './date'
import { expandGoal } from './goals'
import {
  applyScenario,
  dedupeAgainstEntries,
  entryToOccurrence,
  overrideTargetOf,
  type OverrideTargetRef,
} from './projection'
import { expandRecurringRule } from './recurrence'
import type {
  Entry,
  EntryKind,
  EntrySource,
  Goal,
  Occurrence,
  RecurringRule,
  Scenario,
} from './types'

/**
 * A planilha — v1.0 — 28/09/2026 (Fase 14).
 *
 * Uma leitura dos mesmos dados da Análise no formato de uma planilha de gastos mensal: Receitas
 * e Despesas em linhas, um mês por coluna, total por seção, "Quanto sobrou" e o saldo no fim do
 * mês. Nada daqui é gravado — a planilha é derivada inteira a cada leitura (invariantes 6 e 7).
 *
 * Três regras que os testes em `tests/unit/sheet.test.ts` fixam, porque cada uma é um jeito de a
 * planilha mentir sem erro nenhum:
 *
 * 1. **Cada lançamento no mês dele.** O que já existe em `entries` fica na coluna do próprio
 *    mês, pago ou pendente; a previsão (conta fixa, meta) só é expandida **de hoje em diante**,
 *    e descartada quando já virou lançamento (`dedupeAgainstEntries`). A conta de agosto vencida
 *    e não paga continua em agosto, marcada como pendente — e não é empurrada para hoje, como a
 *    curva da Análise faz, senão apareceria nas duas colunas.
 * 2. **Leitura de caixa.** A compra no cartão/empréstimo não é caixa (`isCashEntry`): na planilha
 *    principal cada conta é **uma linha**, com o que sai do saldo no mês — o pagamento de fatura
 *    já feito e o restante ainda devido, no mês do vencimento. O dinheiro que veio de um
 *    empréstimo entra em Receitas, na linha da conta, e não como renda. As compras em si moram na
 *    planilha do cartão (`buildCardSheet`).
 * 3. **O cenário só alcança o futuro**, pela mesma `applyScenario` da Análise. A célula guarda o
 *    valor com o cenário e o real ao lado, para a tela marcar o que o cenário mudou.
 *
 * Pura (invariante 9): `today` entra por parâmetro, e toda conta de calendário é por string ISO.
 */

/** O teto de colunas: três anos já são 36 colunas de largura. */
export const MAX_SHEET_MONTHS = 36

export type SheetGrouping = 'category' | 'none'
export type SheetSort = 'created' | 'occurred' | 'alpha'

export interface SheetMonth {
  /** `YYYY-MM` — a chave das células. */
  key: string
  from: ISODate
  to: ISODate
  /** "out/26". */
  label: string
  /** Mês inteiramente antes de hoje. */
  isPast: boolean
  isCurrent: boolean
}

const MONTH_ABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'] as const

/** Os meses que o período toca, inteiros, até `MAX_SHEET_MONTHS`. */
export function sheetMonths(from: ISODate, to: ISODate, today: ISODate): SheetMonth[] {
  const months: SheetMonth[] = []
  if (from > to) return months
  const last = startOfMonth(to)
  const current = monthKey(today)
  for (let cursor = startOfMonth(from); cursor <= last && months.length < MAX_SHEET_MONTHS; cursor = addMonths(cursor, 1)) {
    const { year, month } = parseISODate(cursor)
    const key = monthKey(cursor)
    months.push({
      key,
      from: cursor,
      to: endOfMonth(cursor),
      label: `${MONTH_ABBR[month - 1]}/${String(year % 100).padStart(2, '0')}`,
      isPast: key < current,
      isCurrent: key === current,
    })
  }
  return months
}

/**
 * A data de um lançamento criado numa coluna: hoje, no mês atual; nos outros, o mesmo dia do mês
 * de hoje, ajustado ao tamanho do mês (dia 31 em fevereiro cai no 28/29, como a conta fixa).
 */
export function dateInSheetMonth(month: Pick<SheetMonth, 'from'>, today: ISODate): ISODate {
  if (monthKey(month.from) === monthKey(today)) return today
  const { year, month: m } = parseISODate(month.from)
  return toISODate({ year, month: m, day: clampDayToMonth(parseISODate(today).day, year, m) })
}

// ---------------------------------------------------------------------------------------
// Itens

export type SheetItemOrigin = 'entry' | 'recurring' | 'goal' | 'bill' | 'scenario'

/** Um movimento dentro de uma célula: um lançamento real, uma previsão ou um item do cenário. */
export interface SheetItem {
  /** A mesma chave da ocorrência na projeção — é por ela que o override do cenário casa. */
  key: string
  date: ISODate
  kind: EntryKind
  amountCents: number
  description: string
  categoryId: string | null
  origin: SheetItemOrigin
  /** O lançamento, quando já existe em `entries`. */
  entryId: string | null
  source: EntrySource | null
  /** Regra, plano, meta, conta (fatura) ou item de cenário. */
  sourceId: string | null
  occurrenceKey: string | null
  isRealized: boolean
  isSettled: boolean
  createdAt: string | null
  creditAccountId: string | null
  installmentNumber: number | null
  installmentTotal: number | null
}

/**
 * O alvo do override de cenário de um item — o mesmo de `overrideTargetOf`, que é o que o motor
 * lê de volta. Montar o alvo à parte faria o ajuste deixar de casar em silêncio.
 */
export function overrideTargetOfItem(item: SheetItem): OverrideTargetRef {
  return overrideTargetOf({
    key: item.key,
    date: item.date,
    kind: item.kind,
    amountCents: item.amountCents,
    description: item.description,
    origin:
      item.origin === 'recurring' || item.origin === 'goal' || item.origin === 'scenario'
        ? item.origin
        : item.origin === 'bill'
          ? 'credit_bill'
          : 'entry',
    sourceId: item.sourceId,
    categoryId: item.categoryId,
    isRealized: item.isRealized,
    isSettled: item.isSettled,
  })
}

/** Um lançamento com o instante em que foi gravado, para ordenar por "data de lançamento". */
export interface SheetEntry extends Entry {
  createdAt: string
}

export type SheetRowKind =
  | 'category'
  | 'entry'
  | 'recurring'
  | 'installment'
  | 'goal'
  | 'credit'
  | 'scenario'
  | 'carry'

export type SheetGroupKey = 'recurring' | 'installment' | 'goal' | 'credit' | 'variable'

export interface SheetCell {
  /** Com o cenário, quando há um; senão, o real. */
  cents: number
  realCents: number
  /** O que a célula soma (com o cenário). */
  items: SheetItem[]
  /** Algum lançamento real ainda pendente. */
  hasPending: boolean
  /** Alguma previsão (conta fixa, meta, fatura, cenário). */
  hasProjected: boolean
}

export interface SheetRow {
  /** Única na planilha. */
  key: string
  kind: SheetRowKind
  /** Categoria, lançamento, regra, plano, meta, conta ou item de cenário; `null` = sem categoria. */
  refId: string | null
  section: EntryKind
  group: SheetGroupKey
  label: string
  cells: Record<string, SheetCell>
  totalCents: number
  /** Para ordenar. */
  firstCreatedAt: string | null
  firstDate: ISODate | null
}

export interface SheetGroup {
  key: SheetGroupKey
  title: string
  rows: SheetRow[]
}

export interface SheetTotal {
  cents: number
  realCents: number
}

export interface SheetSection {
  kind: EntryKind
  groups: SheetGroup[]
  totals: Record<string, SheetTotal>
}

export interface Sheet {
  months: SheetMonth[]
  income: SheetSection
  expense: SheetSection
  /** Receitas − despesas, por mês. */
  leftover: Record<string, SheetTotal>
  /** Saldo no fim do mês; `null` antes da âncora do saldo (o app não sabe). */
  closingBalance: Record<string, SheetTotal | null>
  hasScenario: boolean
}

export interface SheetLabels {
  categories: Readonly<Record<string, string>>
  rules: Readonly<Record<string, string>>
  plans: Readonly<Record<string, string>>
  goals: Readonly<Record<string, string>>
  accounts: Readonly<Record<string, { name: string; kind: 'card' | 'loan' }>>
}

export interface SheetInput {
  from: ISODate
  to: ISODate
  today: ISODate
  /**
   * Os lançamentos de `min(from, hoje)` a `max(to, hoje)`, mais os pendentes vencidos antes
   * disso. O saldo do fim do mês precisa dos liquidados entre o mês e hoje, mesmo fora das
   * colunas.
   */
  entries: readonly SheetEntry[]
  recurringRules: readonly RecurringRule[]
  goals: readonly Goal[]
  bills: readonly CreditBill[]
  labels: SheetLabels
  scenario?: Scenario | null
  /** O saldo de hoje — o mesmo número do Início. */
  currentBalanceCents: number
  /** A âncora do saldo: antes dela não há saldo conhecido. */
  historyStartsOn: ISODate
  grouping: SheetGrouping
  sort: SheetSort
}

function itemFromEntry(entry: SheetEntry): SheetItem {
  return {
    key: entryToOccurrence(entry).key,
    date: entry.occurredOn,
    kind: entry.kind,
    amountCents: entry.amountCents,
    description: entry.description,
    categoryId: entry.categoryId,
    origin: 'entry',
    entryId: entry.id,
    source: entry.source,
    sourceId: entry.sourceId,
    occurrenceKey: entry.occurrenceKey,
    isRealized: true,
    isSettled: entry.isSettled,
    createdAt: entry.createdAt,
    creditAccountId: entry.creditAccountId ?? null,
    installmentNumber: entry.installmentNumber,
    installmentTotal: entry.installmentTotal,
  }
}

function itemFromOccurrence(occurrence: Occurrence): SheetItem {
  const parts = occurrence.key.split(':')
  const origin: SheetItemOrigin =
    occurrence.origin === 'recurring' || occurrence.origin === 'goal' || occurrence.origin === 'scenario'
      ? occurrence.origin
      : occurrence.origin === 'credit_bill'
        ? 'bill'
        : 'entry'
  return {
    key: occurrence.key,
    date: occurrence.date,
    kind: occurrence.kind,
    amountCents: occurrence.amountCents,
    description: occurrence.description,
    categoryId: occurrence.categoryId,
    origin,
    entryId: null,
    source: origin === 'recurring' ? 'recurring' : origin === 'goal' ? 'goal' : null,
    sourceId: occurrence.sourceId,
    occurrenceKey: parts.length >= 3 ? (parts[2] ?? null) : null,
    isRealized: false,
    isSettled: false,
    createdAt: null,
    creditAccountId: null,
    installmentNumber: null,
    installmentTotal: null,
  }
}

/** O restante ainda devido de uma fatura, no mês do vencimento. */
function itemFromBill(bill: CreditBill): SheetItem {
  return {
    key: `bill:${bill.accountId}:${bill.dueOn}`,
    date: bill.dueOn,
    kind: 'expense',
    amountCents: bill.remainingCents,
    description: billLabel(bill),
    categoryId: null,
    origin: 'bill',
    entryId: null,
    source: null,
    sourceId: bill.accountId,
    occurrenceKey: bill.dueOn,
    isRealized: false,
    isSettled: false,
    createdAt: null,
    creditAccountId: bill.accountId,
    installmentNumber: null,
    installmentTotal: null,
  }
}

/** `true` quando o item ainda não está no saldo de hoje — o complemento de `computeBalance`. */
function isAhead(item: SheetItem, today: ISODate): boolean {
  return !(item.isSettled && item.date <= today)
}

/** Os itens reais: lançamentos de caixa, previsão de hoje em diante e faturas devidas. */
function realItems(input: SheetInput): SheetItem[] {
  const { entries, today, to } = input
  const items: SheetItem[] = entries.filter((entry) => isCashEntry(entry)).map(itemFromEntry)

  if (to >= today) {
    const projected: Occurrence[] = []
    // A conta fixa no cartão é cobrança da fatura, não caixa: entra pela fatura.
    for (const rule of input.recurringRules) {
      if (rule.creditAccountId) continue
      projected.push(...expandRecurringRule(rule, today, to))
    }
    for (const goal of input.goals) projected.push(...expandGoal(goal, today, to))
    items.push(...dedupeAgainstEntries(projected, entries).map(itemFromOccurrence))
  }

  for (const bill of input.bills) {
    if (isBillDue(bill)) items.push(itemFromBill(bill))
  }
  return items
}

/** O futuro com o cenário aplicado, pela mesma regra da Análise. */
function scenarioItems(real: readonly SheetItem[], scenario: Scenario, today: ISODate, to: ISODate): SheetItem[] {
  if (to < today) return [...real]
  const byKey = new Map<string, SheetItem>()
  const future: Occurrence[] = []
  const rest: SheetItem[] = []
  for (const item of real) {
    // A fatura fica de fora do cenário, como em `projectWindow`; o fato também.
    if (item.origin === 'bill' || item.date < today || !isAhead(item, today)) {
      rest.push(item)
      continue
    }
    byKey.set(item.key, item)
    future.push({
      key: item.key,
      date: item.date,
      kind: item.kind,
      amountCents: item.amountCents,
      description: item.description,
      origin: item.origin === 'recurring' || item.origin === 'goal' ? item.origin : 'entry',
      sourceId: item.sourceId,
      categoryId: item.categoryId,
      isRealized: item.isRealized,
      isSettled: item.isSettled,
    })
  }

  const applied = applyScenario(future, scenario, today, to).map((occurrence) => {
    const original = byKey.get(occurrence.key)
    return original
      ? { ...original, date: occurrence.date, amountCents: occurrence.amountCents }
      : itemFromOccurrence(occurrence)
  })
  return [...rest, ...applied]
}

// ---------------------------------------------------------------------------------------
// Linhas

interface RowIdentity {
  key: string
  kind: SheetRowKind
  refId: string | null
  group: SheetGroupKey
  label: string
}

const NO_CATEGORY = 'Sem categoria'

function rowOf(item: SheetItem, input: SheetInput): RowIdentity {
  const { labels, grouping } = input
  const section = item.kind

  // Cartão e empréstimo: uma linha por conta. A fatura devida, o pagamento já feito e o
  // dinheiro que veio do empréstimo.
  const accountId =
    item.origin === 'bill'
      ? item.sourceId
      : item.source === 'credit_bill'
        ? item.sourceId
        : item.creditAccountId && item.kind === 'income'
          ? item.creditAccountId
          : null
  if (accountId) {
    const account = labels.accounts[accountId]
    const label = account
      ? item.kind === 'income'
        ? account.name
        : billLabel({ accountKind: account.kind, accountName: account.name })
      : item.description
    return { key: `${section}:credit:${accountId}`, kind: 'credit', refId: accountId, group: 'credit', label }
  }

  if (item.source === 'recurring' && item.sourceId) {
    return {
      key: `${section}:recurring:${item.sourceId}`,
      kind: 'recurring',
      refId: item.sourceId,
      group: 'recurring',
      label: labels.rules[item.sourceId] ?? item.description,
    }
  }
  if (item.source === 'installment' && item.sourceId) {
    return {
      key: `${section}:installment:${item.sourceId}`,
      kind: 'installment',
      refId: item.sourceId,
      group: 'installment',
      label: labels.plans[item.sourceId] ?? item.description.replace(/\s*\(\d+\/\d+\)$/, ''),
    }
  }
  if (item.source === 'goal' && item.sourceId) {
    const name = labels.goals[item.sourceId]
    return {
      key: `${section}:goal:${item.sourceId}`,
      kind: 'goal',
      refId: item.sourceId,
      group: 'goal',
      label: name ? `Meta: ${name}` : item.description,
    }
  }

  if (grouping === 'category') {
    const categoryId = item.categoryId
    return {
      key: `${section}:category:${categoryId ?? 'none'}`,
      kind: 'category',
      refId: categoryId,
      group: 'variable',
      label: categoryId ? (labels.categories[categoryId] ?? NO_CATEGORY) : NO_CATEGORY,
    }
  }
  if (item.origin === 'scenario') {
    return {
      key: `${section}:scenario:${item.sourceId ?? item.key}`,
      kind: 'scenario',
      refId: item.sourceId,
      group: 'variable',
      label: item.description,
    }
  }
  return {
    key: `${section}:entry:${item.entryId ?? item.key}`,
    kind: 'entry',
    refId: item.entryId,
    group: 'variable',
    label: item.description,
  }
}

const GROUP_ORDER: readonly SheetGroupKey[] = ['recurring', 'installment', 'goal', 'credit', 'variable']

const GROUP_TITLES: Record<EntryKind, Record<SheetGroupKey, string>> = {
  income: {
    recurring: 'Renda fixa',
    installment: 'Parcelamentos',
    goal: 'Metas',
    credit: 'Empréstimos',
    variable: 'Avulsas',
  },
  expense: {
    recurring: 'Contas fixas',
    installment: 'Parcelamentos',
    goal: 'Metas',
    credit: 'Cartões e empréstimos',
    variable: 'Avulsos',
  },
}

function emptyCell(): SheetCell {
  return { cents: 0, realCents: 0, items: [], hasPending: false, hasProjected: false }
}

function minString(a: string | null, b: string | null): string | null {
  if (a === null) return b
  if (b === null) return a
  return a < b ? a : b
}

/** Ordena as linhas de um grupo pelo critério escolhido; o nome desempata. */
export function sortRows<T extends Pick<SheetRow, 'label' | 'firstCreatedAt' | 'firstDate'>>(
  rows: readonly T[],
  sort: SheetSort,
): T[] {
  const byLabel = (a: T, b: T) => a.label.localeCompare(b.label, 'pt-BR', { sensitivity: 'base' })
  const byNullable = (a: string | null, b: string | null) =>
    a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? -1 : 1
  return [...rows].sort((a, b) => {
    if (sort === 'created') return byNullable(a.firstCreatedAt, b.firstCreatedAt) || byLabel(a, b)
    if (sort === 'occurred') return byNullable(a.firstDate, b.firstDate) || byLabel(a, b)
    return byLabel(a, b)
  })
}

interface RowAccumulator extends RowIdentity {
  section: EntryKind
  cells: Map<string, SheetCell>
  firstCreatedAt: string | null
  firstDate: ISODate | null
}

function buildSections(
  months: readonly SheetMonth[],
  shown: readonly SheetItem[],
  real: readonly SheetItem[],
  input: SheetInput,
): { income: SheetSection; expense: SheetSection } {
  const monthKeys = new Set(months.map((m) => m.key))
  const rows = new Map<string, RowAccumulator>()

  const rowFor = (item: SheetItem): RowAccumulator => {
    const identity = rowOf(item, input)
    let row = rows.get(identity.key)
    if (!row) {
      row = { ...identity, section: item.kind, cells: new Map(), firstCreatedAt: null, firstDate: null }
      rows.set(identity.key, row)
    }
    return row
  }
  const cellFor = (row: RowAccumulator, month: string): SheetCell => {
    let cell = row.cells.get(month)
    if (!cell) {
      cell = emptyCell()
      row.cells.set(month, cell)
    }
    return cell
  }

  for (const item of shown) {
    const month = monthKey(item.date)
    if (!monthKeys.has(month)) continue
    const row = rowFor(item)
    const cell = cellFor(row, month)
    cell.cents += item.amountCents
    cell.items.push(item)
    if (item.isRealized && !item.isSettled) cell.hasPending = true
    if (!item.isRealized) cell.hasProjected = true
    row.firstCreatedAt = minString(row.firstCreatedAt, item.createdAt)
    row.firstDate = minString(row.firstDate, item.date)
  }
  for (const item of real) {
    const month = monthKey(item.date)
    if (!monthKeys.has(month)) continue
    cellFor(rowFor(item), month).realCents += item.amountCents
  }

  const section = (kind: EntryKind): SheetSection => {
    const totals: Record<string, SheetTotal> = {}
    for (const month of months) totals[month.key] = { cents: 0, realCents: 0 }

    const finished: SheetRow[] = []
    for (const row of rows.values()) {
      if (row.section !== kind) continue
      const cells: Record<string, SheetCell> = {}
      let totalCents = 0
      for (const [month, cell] of row.cells) {
        cells[month] = cell
        totalCents += cell.cents
        const total = totals[month]
        if (total) {
          total.cents += cell.cents
          total.realCents += cell.realCents
        }
      }
      // Uma linha que só existia no real (o cenário a excluiu inteira) continua visível, zerada,
      // para a pessoa ver o que o cenário tirou.
      finished.push({
        key: row.key,
        kind: row.kind,
        refId: row.refId,
        section: row.section,
        group: row.group,
        label: row.label,
        cells,
        totalCents,
        firstCreatedAt: row.firstCreatedAt,
        firstDate: row.firstDate,
      })
    }

    const groups: SheetGroup[] = []
    for (const key of GROUP_ORDER) {
      const inGroup = finished.filter((row) => row.group === key)
      if (inGroup.length === 0) continue
      groups.push({ key, title: GROUP_TITLES[kind][key], rows: sortRows(inGroup, input.sort) })
    }
    return { kind, groups, totals }
  }

  return { income: section('income'), expense: section('expense') }
}

function signed(item: SheetItem): number {
  return item.kind === 'income' ? item.amountCents : -item.amountCents
}

/**
 * O saldo no fim de cada mês.
 *
 * - Mês que termina antes de hoje: o saldo de hoje menos o que foi liquidado depois dele.
 * - Mês que termina hoje ou depois: o saldo de hoje mais o que ainda vai acontecer até o fim
 *   dele — o complemento exato do saldo (`isAhead`), para nada contar duas vezes.
 * - Antes da âncora: `null`. O app não sabe, e a tela diz isso em vez de inventar.
 */
function closingBalances(
  months: readonly SheetMonth[],
  items: readonly SheetItem[],
  input: SheetInput,
): Record<string, number | null> {
  const { today, currentBalanceCents, historyStartsOn } = input
  const result: Record<string, number | null> = {}
  for (const month of months) {
    const end = month.to
    if (end < historyStartsOn) {
      result[month.key] = null
      continue
    }
    let balance = currentBalanceCents
    if (end < today) {
      for (const item of items) {
        if (item.isSettled && item.date > end && item.date <= today) balance -= signed(item)
      }
    } else {
      for (const item of items) {
        if (isAhead(item, today) && item.date <= end) balance += signed(item)
      }
    }
    result[month.key] = balance
  }
  return result
}

/** A planilha principal. */
export function buildSheet(input: SheetInput): Sheet {
  const months = sheetMonths(input.from, input.to, input.today)
  const real = realItems(input)
  const scenario = input.scenario ?? null
  const shown = scenario ? scenarioItems(real, scenario, input.today, input.to) : real

  const { income, expense } = buildSections(months, shown, real, input)

  const leftover: Record<string, SheetTotal> = {}
  for (const month of months) {
    const inflow = income.totals[month.key] ?? { cents: 0, realCents: 0 }
    const outflow = expense.totals[month.key] ?? { cents: 0, realCents: 0 }
    leftover[month.key] = {
      cents: inflow.cents - outflow.cents,
      realCents: inflow.realCents - outflow.realCents,
    }
  }

  const realBalance = closingBalances(months, real, input)
  const shownBalance = scenario ? closingBalances(months, shown, input) : realBalance
  const closingBalance: Record<string, SheetTotal | null> = {}
  for (const month of months) {
    const realCents = realBalance[month.key] ?? null
    const cents = shownBalance[month.key] ?? null
    closingBalance[month.key] = realCents === null || cents === null ? null : { cents, realCents }
  }

  return { months, income, expense, leftover, closingBalance, hasScenario: scenario !== null }
}

// ---------------------------------------------------------------------------------------
// Planilha do cartão

export interface CardSheetItem {
  key: string
  /** O vencimento da fatura em que a cobrança cai. */
  dueOn: ISODate
  /** A data do gasto. */
  occurredOn: ISODate
  amountCents: number
  description: string
  categoryId: string | null
  entryId: string | null
  ruleId: string | null
  source: EntrySource
  /** Plano, para a parcela. */
  sourceId: string | null
  /** A cobrança `number` de `total` desta dívida. */
  number: number
  total: number
  createdAt: string | null
  kind: EntryKind
}

export interface CardSheetRow {
  key: string
  kind: SheetRowKind
  refId: string | null
  label: string
  cells: Record<string, { cents: number; items: CardSheetItem[] }>
  totalCents: number
  firstCreatedAt: string | null
  firstDate: ISODate | null
}

export interface CardSheetBillCell {
  totalCents: number
  carryInCents: number
  paidCents: number
  remainingCents: number
  /** A situação da última fatura do mês. */
  status: CreditBill['status']
  dueOn: ISODate
}

export interface CardSheet {
  months: SheetMonth[]
  groups: { key: SheetGroupKey; title: string; rows: CardSheetRow[] }[]
  bills: Record<string, CardSheetBillCell | null>
}

export interface CardSheetInput {
  from: ISODate
  to: ISODate
  today: ISODate
  /** As faturas desta conta. */
  bills: readonly CreditBill[]
  /** Os lançamentos financiados (do ledger), com o instante de criação quando houver. */
  fundedEntries: readonly (Entry & { createdAt?: string | null })[]
  labels: SheetLabels
  grouping: SheetGrouping
  sort: SheetSort
}

/**
 * A planilha de um cartão ou empréstimo: as cobranças de cada fatura, no mês do vencimento. A
 * compra com a data em que foi feita fica no item; a coluna é a fatura, que é o que a pessoa
 * paga. Derivada das faturas de `getCreditLedger` — nenhuma soma é recalculada aqui além de
 * agrupar.
 */
export function buildCardSheet(input: CardSheetInput): CardSheet {
  const months = sheetMonths(input.from, input.to, input.today)
  const monthKeys = new Set(months.map((m) => m.key))
  const entryById = new Map(input.fundedEntries.map((entry) => [entry.id, entry]))
  const rows = new Map<string, CardSheetRow & { group: SheetGroupKey }>()
  const bills: Record<string, CardSheetBillCell | null> = {}
  for (const month of months) bills[month.key] = null

  for (const bill of input.bills) {
    const month = monthKey(bill.dueOn)
    if (!monthKeys.has(month)) continue
    const previous = bills[month]
    bills[month] = {
      totalCents: (previous?.totalCents ?? 0) + bill.totalCents,
      carryInCents: (previous?.carryInCents ?? 0) + bill.carryInCents,
      paidCents: (previous?.paidCents ?? 0) + bill.paidCents,
      remainingCents: (previous?.remainingCents ?? 0) + bill.remainingCents,
      status: bill.status,
      dueOn: bill.dueOn,
    }

    for (const charge of bill.charges) {
      const entry = charge.entryId ? entryById.get(charge.entryId) : undefined
      const item: CardSheetItem = {
        key: `charge:${charge.entryId ?? charge.ruleId ?? charge.description}:${charge.dueOn}:${charge.number}`,
        dueOn: charge.dueOn,
        occurredOn: charge.occurredOn,
        amountCents: charge.amountCents,
        description: charge.description,
        categoryId: charge.categoryId,
        entryId: charge.entryId,
        ruleId: charge.ruleId ?? (entry?.source === 'recurring' ? entry.sourceId : null),
        source: charge.source,
        sourceId: entry?.sourceId ?? null,
        number: charge.number,
        total: charge.total,
        createdAt: entry?.createdAt ?? null,
        kind: charge.kind,
      }
      const identity = cardRowOf(item, input)
      let row = rows.get(identity.key)
      if (!row) {
        row = { ...identity, cells: {}, totalCents: 0, firstCreatedAt: null, firstDate: null }
        rows.set(identity.key, row)
      }
      const cell = (row.cells[month] ??= { cents: 0, items: [] })
      cell.cents += item.amountCents
      cell.items.push(item)
      row.totalCents += item.amountCents
      row.firstCreatedAt = minString(row.firstCreatedAt, item.createdAt)
      row.firstDate = minString(row.firstDate, item.occurredOn)
    }
  }

  const titles: Record<SheetGroupKey, string> = {
    recurring: 'Contas fixas no cartão',
    installment: 'Parcelamentos',
    goal: 'Metas',
    credit: 'Parcelamento da fatura',
    variable: 'Compras',
  }
  const all = [...rows.values()]
  const groups = GROUP_ORDER.flatMap((key) => {
    const inGroup = all.filter((row) => row.group === key)
    if (inGroup.length === 0) return []
    return [{ key, title: titles[key], rows: sortRows(inGroup, input.sort).map(({ group: _group, ...row }) => row) }]
  })

  return { months, groups, bills }
}

function cardRowOf(item: CardSheetItem, input: CardSheetInput): RowIdentity {
  const { labels } = input
  if (item.ruleId) {
    return {
      key: `recurring:${item.ruleId}`,
      kind: 'recurring',
      refId: item.ruleId,
      group: 'recurring',
      label: labels.rules[item.ruleId] ?? item.description,
    }
  }
  if (item.source === 'installment' && item.sourceId) {
    return {
      key: `installment:${item.sourceId}`,
      kind: 'installment',
      refId: item.sourceId,
      group: 'installment',
      label: labels.plans[item.sourceId] ?? item.description.replace(/\s*\(\d+\/\d+\)$/, ''),
    }
  }
  if (item.source === 'credit_carry') {
    return {
      key: `carry:${item.entryId ?? item.key}`,
      kind: 'carry',
      refId: item.entryId,
      group: 'credit',
      label: item.description,
    }
  }
  if (input.grouping === 'category') {
    return {
      key: `category:${item.categoryId ?? 'none'}`,
      kind: 'category',
      refId: item.categoryId,
      group: 'variable',
      label: item.categoryId ? (labels.categories[item.categoryId] ?? NO_CATEGORY) : NO_CATEGORY,
    }
  }
  return {
    key: `entry:${item.entryId ?? item.key}`,
    kind: 'entry',
    refId: item.entryId,
    group: 'variable',
    label: item.description,
  }
}
