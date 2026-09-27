import {
  addMonths,
  clampDayToMonth,
  compareISO,
  parseISODate,
  toISODate,
  type ISODate,
} from './date'
import { splitCents } from './money'
import { dedupeAgainstEntries } from './projection'
import { expandRecurringRule } from './recurrence'
import { isBillDue } from './cash'
import type { CreditBillLike, Entry, EntryKind, EntrySource, RecurringRule } from './types'

// O lado "caixa" mora em ./cash, que não importa a projeção — assim a projeção o usa sem ciclo
// de import (este arquivo importa `dedupeAgainstEntries` de lá).
export { billLabel, billOccurrences, isBillDue, isCashEntry } from './cash'

/**
 * Cartões e empréstimos — v1.0 — 2026-09-27 (Fase 13).
 *
 * Um lançamento pode vir de um cartão ou de um empréstimo em vez do saldo. A partir daí ele
 * tem duas leituras, e este módulo é o único lugar que decide cada uma:
 *
 * - **Competência** (`competenceCents`): o que foi gasto, em quê, quando. A compra no cartão
 *   conta na categoria dela, na data do gasto. O pagamento da fatura e o parcelamento da
 *   fatura NÃO contam de novo: são a soma das compras. O dinheiro que veio de um empréstimo
 *   não é renda. Os juros (`interest_cents`) contam como "Juros e encargos".
 * - **Caixa** (`isCashEntry`, `billOccurrences`): quando o dinheiro sai do saldo. A saída no
 *   cartão não sai; sai a fatura, no vencimento, e de verdade quando é paga (`credit_bill`).
 *
 * As cobranças e as faturas são DERIVADAS das linhas de `entries` (invariante 7): nenhuma
 * tabela de fatura, nenhum total gravado. `buildBills` percorre os vencimentos em ordem e
 * decide, para cada um, quanto foi cobrado, quanto foi pago e o que acontece com o restante —
 * rola para a fatura seguinte (rotativo), foi parcelado (`credit_carry`) ou está em aberto.
 *
 * Puro: sem I/O, sem relógio — `today` entra por parâmetro (invariante 9). A mesma regra do
 * ciclo do cartão está escrita em SQL em `credit_first_due()` (migration 0021); os mesmos
 * casos são conferidos aqui (tests/unit/credit.test.ts) e lá (supabase/tests/01_rls_proof.sql).
 */

export type CreditAccountKind = 'card' | 'loan'

export interface CreditAccount {
  id: string
  kind: CreditAccountKind
  name: string
  /** `null` = sem limite determinado. */
  limitCents: number | null
  /** Cartão: dia em que a fatura fecha. */
  closingDay: number | null
  /** Cartão: dia do vencimento. Empréstimo: dia fixo das parcelas. */
  dueDay: number | null
  /** Empréstimo de vencimento único. */
  dueOn: ISODate | null
  keywords: readonly string[]
  archivedAt: string | null
}

export type CreditBillStatus = CreditBillLike['status']

/** Uma cobrança: a parte de uma dívida que vence numa fatura. */
export interface CreditCharge {
  accountId: string
  dueOn: ISODate
  amountCents: number
  /** O lançamento que gerou a cobrança; `null` na conta fixa ainda não materializada. */
  entryId: string | null
  /** Conta fixa no cartão, prevista: a regra e a data da ocorrência. */
  ruleId: string | null
  occurredOn: ISODate
  description: string
  categoryId: string | null
  kind: EntryKind
  source: EntrySource
  /** 1-based, e o total, quando a dívida é paga em mais de uma vez. */
  number: number
  total: number
}

/** Um pagamento de fatura (`source = 'credit_bill'`). */
export interface CreditPayment {
  entryId: string
  accountId: string
  dueOn: ISODate
  paidOn: ISODate
  amountCents: number
  /** Parte do pagamento que passou do total calculado — juros e encargos. */
  interestCents: number
}

export interface CreditBill extends CreditBillLike {
  /** Cartão: o dia em que a fatura fecha. Empréstimo: `null`. */
  closingOn: ISODate | null
  chargesCents: number
  /** O que rolou da fatura anterior paga em parte (rotativo). */
  carryInCents: number
  totalCents: number
  /** Pago que abate a fatura (sem o excedente de juros). */
  paidCents: number
  charges: CreditCharge[]
  payments: CreditPayment[]
}

// ---------------------------------------------------------------------------------------
// O ciclo

function dateInMonth(year: number, month: number, day: number): ISODate {
  return toISODate({ year, month, day: clampDayToMonth(day, year, month) })
}

function shiftMonth(date: ISODate, months: number): { year: number; month: number } {
  const { year, month } = parseISODate(addMonths(date.slice(0, 8) + '01', months))
  return { year, month }
}

/**
 * O vencimento da fatura em que cai uma compra feita em `purchaseOn`.
 *
 * A fatura fecha no `closingDay` (ajustado ao fim do mês). Compra até o fechamento entra na
 * fatura que fecha naquele mês; depois, na seguinte. O vencimento é o `dueDay` do mesmo mês do
 * fechamento quando o dia é maior que o do fechamento, senão do mês seguinte — e nunca no
 * próprio dia do fechamento (fevereiro com fechamento 30 e vencimento 31 vira 28 e 28).
 */
export function cardDueFor(purchaseOn: ISODate, closingDay: number, dueDay: number): ISODate {
  const { year, month } = parseISODate(purchaseOn)
  let closing = dateInMonth(year, month, closingDay)
  let closingMonth = { year, month }
  if (purchaseOn > closing) {
    closingMonth = shiftMonth(purchaseOn, 1)
    closing = dateInMonth(closingMonth.year, closingMonth.month, closingDay)
  }

  let dueMonth = closingMonth
  if (dueDay <= closingDay) dueMonth = shiftMonth(closing, 1)
  let due = dateInMonth(dueMonth.year, dueMonth.month, dueDay)

  if (due <= closing) {
    const next = shiftMonth(due, 1)
    due = dateInMonth(next.year, next.month, dueDay)
  }
  return due
}

/** O dia em que fecha a fatura que vence em `dueOn`. O inverso de `cardDueFor`. */
export function cardClosingFor(dueOn: ISODate, closingDay: number, dueDay: number): ISODate {
  // O fechamento é o último `closingDay` cujo vencimento calculado é `dueOn`. Tentamos o mês
  // do vencimento e os dois anteriores — o ciclo nunca passa de um mês e pouco.
  for (let back = 0; back <= 2; back += 1) {
    const m = shiftMonth(dueOn, -back)
    const closing = dateInMonth(m.year, m.month, closingDay)
    if (closing < dueOn && cardDueFor(closing, closingDay, dueDay) === dueOn) return closing
  }
  const prev = shiftMonth(dueOn, -1)
  return dateInMonth(prev.year, prev.month, closingDay)
}

/**
 * Quando será paga a dívida de um gasto feito em `occurredOn`: a sugestão da tela e a regra
 * da conta fixa no cartão. `null` quando não há como saber (empréstimo sem vencimento
 * cadastrado, ou com o vencimento único já passado) — aí a tela pede a data.
 *
 * A MESMA regra de `credit_first_due()` na migration 0021.
 */
export function defaultFirstDue(
  account: Pick<CreditAccount, 'kind' | 'closingDay' | 'dueDay' | 'dueOn'>,
  occurredOn: ISODate,
): ISODate | null {
  if (account.kind === 'card') {
    if (account.closingDay === null || account.dueDay === null) return null
    return cardDueFor(occurredOn, account.closingDay, account.dueDay)
  }
  if (account.dueOn !== null) return account.dueOn >= occurredOn ? account.dueOn : null
  if (account.dueDay !== null) {
    const { year, month } = parseISODate(occurredOn)
    const due = dateInMonth(year, month, account.dueDay)
    if (due > occurredOn) return due
    const next = shiftMonth(occurredOn, 1)
    return dateInMonth(next.year, next.month, account.dueDay)
  }
  return null
}

/** O vencimento seguinte a `dueOn`, no dia fixo da conta (ou no próprio dia de `dueOn`). */
export function nextDueAfter(
  account: Pick<CreditAccount, 'dueDay'>,
  dueOn: ISODate,
  months = 1,
): ISODate {
  const anchor = account.dueDay ?? parseISODate(dueOn).day
  const m = shiftMonth(dueOn, months)
  return dateInMonth(m.year, m.month, anchor)
}

// ---------------------------------------------------------------------------------------
// As duas leituras de um lançamento

type CreditFields = Pick<Entry, 'kind' | 'source' | 'amountCents'> & {
  creditAccountId?: string | null
  interestCents?: number
}

/** `true` quando o lançamento é uma dívida num cartão/empréstimo (o selo na lista). */
export function isFunded(entry: { creditAccountId?: string | null }): boolean {
  return Boolean(entry.creditAccountId)
}

/**
 * Quanto o lançamento conta na competência — a regra que as views da 0021 também seguem.
 *
 * - `principalCents`: conta no seu tipo (entrada ou saída) e na sua categoria. Zero no
 *   pagamento e no parcelamento de fatura (as compras já contaram) e no dinheiro que veio de
 *   cartão/empréstimo (é dívida, não renda).
 * - `interestCents`: conta sempre como saída, em "Juros e encargos".
 */
export function competenceCents(entry: CreditFields): { principalCents: number; interestCents: number } {
  const interestCents = entry.interestCents ?? 0
  if (entry.source === 'credit_bill' || entry.source === 'credit_carry') {
    return { principalCents: 0, interestCents }
  }
  if (entry.creditAccountId && entry.kind === 'income') return { principalCents: 0, interestCents }
  return { principalCents: entry.amountCents, interestCents }
}

// ---------------------------------------------------------------------------------------
// Cobranças

/** Os vencimentos de uma dívida paga em `count` vezes a partir de `firstDue`. */
export function chargeSchedule(
  account: Pick<CreditAccount, 'dueDay'>,
  firstDue: ISODate,
  count: number,
): ISODate[] {
  const dates: ISODate[] = [firstDue]
  for (let i = 1; i < count; i += 1) dates.push(nextDueAfter(account, firstDue, i))
  return dates
}

/**
 * As cobranças de um lançamento financiado: `amount + juros` em `chargeCount` partes
 * cent-exatas (`splitCents`, invariante 1), uma por vencimento mensal. A soma das cobranças é
 * sempre `amountCents + interestCents`.
 */
export function chargesOf(entry: Entry, account: Pick<CreditAccount, 'id' | 'dueDay'>): CreditCharge[] {
  if (!entry.creditAccountId || !entry.chargeFirstDueOn) return []
  const count = entry.chargeCount ?? 1
  const total = entry.amountCents + (entry.interestCents ?? 0)
  const amounts = splitCents(total, count)
  const dates = chargeSchedule(account, entry.chargeFirstDueOn, count)

  return amounts.map((amountCents, index) => ({
    accountId: account.id,
    dueOn: dates[index] ?? entry.chargeFirstDueOn!,
    amountCents,
    entryId: entry.id,
    ruleId: null,
    occurredOn: entry.occurredOn,
    description: entry.description,
    categoryId: entry.categoryId,
    kind: entry.kind,
    source: entry.source,
    number: index + 1,
    total: count,
  }))
}

/**
 * As cobranças PREVISTAS de uma conta fixa no cartão: as ocorrências ainda não materializadas
 * que caem numa fatura que vence de `today` em diante. Fatura já vencida só conta o que virou
 * lançamento — inventar cobrança num vencimento que passou fabricaria uma fatura em atraso que
 * a pessoa nunca teve (mesma razão da Análise expandir recorrência de `hoje`, não de `from`).
 */
export function recurringCharges(
  rule: RecurringRule,
  account: CreditAccount,
  today: ISODate,
  to: ISODate,
  entries: readonly Entry[],
): CreditCharge[] {
  if (rule.creditAccountId !== account.id || rule.kind !== 'expense') return []
  // Uma ocorrência de até ~2 meses atrás ainda pode cair numa fatura que vence hoje ou depois.
  const from = toISODate({ ...shiftMonth(today, -2), day: 1 })
  const occurrences = dedupeAgainstEntries(expandRecurringRule(rule, from, to), entries)

  const charges: CreditCharge[] = []
  for (const occurrence of occurrences) {
    const dueOn = defaultFirstDue(account, occurrence.date) ?? occurrence.date
    if (dueOn < today) continue
    charges.push({
      accountId: account.id,
      dueOn,
      amountCents: occurrence.amountCents,
      entryId: null,
      ruleId: rule.id,
      occurredOn: occurrence.date,
      description: occurrence.description,
      categoryId: occurrence.categoryId,
      kind: 'expense',
      source: 'recurring',
      number: 1,
      total: 1,
    })
  }
  return charges
}

/** O pagamento de fatura lido de um lançamento `credit_bill`. */
export function paymentOf(entry: Entry): CreditPayment | null {
  if (entry.source !== 'credit_bill' || !entry.sourceId || !entry.occurrenceKey) return null
  return {
    entryId: entry.id,
    accountId: entry.sourceId,
    dueOn: entry.occurrenceKey.slice(0, 10),
    paidOn: entry.occurredOn,
    amountCents: entry.amountCents,
    interestCents: entry.interestCents ?? 0,
  }
}

// ---------------------------------------------------------------------------------------
// Faturas

export interface BuildBillsInput {
  account: CreditAccount
  charges: readonly CreditCharge[]
  payments: readonly CreditPayment[]
  /** Vencimentos cujo restante foi parcelado (`credit_carry.occurrence_key`). */
  carriedDueOns: ReadonlySet<ISODate>
  today: ISODate
}

/**
 * As faturas de uma conta, em ordem de vencimento.
 *
 * Para cada vencimento: `total = cobranças + o que rolou da anterior`; `pago = Σ pagamentos`
 * dele (sem o excedente, que é juro); `restante = total − pago`. O status:
 *
 * - `paid` — nada restante;
 * - `carried` — o restante foi parcelado (`credit_carry`): as parcelas já são cobranças das
 *   faturas seguintes, e nada rola;
 * - `rolled` — houve pagamento parcial e o vencimento passou: o restante ROLA para a fatura
 *   seguinte (rotativo). Se ainda não há fatura seguinte, ela nasce no próximo vencimento;
 * - `overdue` — venceu sem pagamento nenhum: o restante continua devido ali;
 * - `partial` — pago em parte, ainda não venceu;
 * - `closed` / `open` — cartão com a fatura fechada ou ainda aberta.
 */
export function buildBills(input: BuildBillsInput): CreditBill[] {
  const { account, charges, payments, carriedDueOns, today } = input

  const byDue = new Map<ISODate, { charges: CreditCharge[]; payments: CreditPayment[] }>()
  const slot = (dueOn: ISODate) => {
    let s = byDue.get(dueOn)
    if (!s) {
      s = { charges: [], payments: [] }
      byDue.set(dueOn, s)
    }
    return s
  }
  for (const charge of charges) if (charge.accountId === account.id) slot(charge.dueOn).charges.push(charge)
  for (const payment of payments) if (payment.accountId === account.id) slot(payment.dueOn).payments.push(payment)

  const dues = [...byDue.keys()].sort(compareISO)
  const bills: CreditBill[] = []
  let carryIn = 0

  for (let i = 0; i < dues.length; i += 1) {
    const dueOn = dues[i]!
    const s = byDue.get(dueOn)!
    const chargesCents = s.charges.reduce((sum, c) => sum + c.amountCents, 0)
    const paidCents = s.payments.reduce((sum, p) => sum + p.amountCents - p.interestCents, 0)
    const totalCents = chargesCents + carryIn
    const remainingCents = totalCents - paidCents
    const closingOn =
      account.kind === 'card' && account.closingDay !== null && account.dueDay !== null
        ? cardClosingFor(dueOn, account.closingDay, account.dueDay)
        : null

    let status: CreditBillStatus
    let rolls = 0
    if (remainingCents <= 0) status = 'paid'
    else if (carriedDueOns.has(dueOn)) status = 'carried'
    else if (paidCents > 0 && dueOn < today) {
      status = 'rolled'
      rolls = remainingCents
    } else if (dueOn < today) status = 'overdue'
    else if (paidCents > 0) status = 'partial'
    else if (closingOn !== null && closingOn < today) status = 'closed'
    else status = 'open'

    bills.push({
      accountId: account.id,
      accountName: account.name,
      accountKind: account.kind,
      dueOn,
      closingOn,
      chargesCents,
      carryInCents: carryIn,
      totalCents,
      paidCents,
      remainingCents,
      status,
      charges: s.charges,
      payments: s.payments,
    })

    carryIn = rolls
    // O rotativo precisa de uma fatura para cair: se esta era a última, nasce a seguinte.
    if (rolls > 0 && i === dues.length - 1) {
      const next = nextDueAfter(account, dueOn)
      byDue.set(next, { charges: [], payments: [] })
      dues.push(next)
    }
  }

  return bills
}

/** Quanto do limite está tomado: tudo o que ainda é devido, desta fatura em diante. */
export function usedLimitCents(bills: readonly CreditBill[]): number {
  return bills.reduce((sum, bill) => sum + (isBillDue(bill) ? bill.remainingCents : 0), 0)
}

/** Limite disponível; `null` para conta sem limite. Pode ser negativo (passou do limite). */
export function availableLimitCents(account: CreditAccount, bills: readonly CreditBill[]): number | null {
  if (account.limitCents === null) return null
  return account.limitCents - usedLimitCents(bills)
}

/**
 * A parte de um pagamento que passa do restante da fatura: juros e encargos. Sem fatura
 * calculada para o vencimento (nada foi lançado nele), não há com o que comparar — nada é
 * chamado de juro, e o pagamento abate o que vier depois.
 */
export function excessInterestCents(bill: Pick<CreditBill, 'remainingCents'> | null, paidCents: number): number {
  if (!bill) return 0
  return Math.max(0, paidCents - Math.max(0, bill.remainingCents))
}

/** A próxima fatura que ainda cobra alguma coisa — a do topo do cartão. */
export function currentBill(bills: readonly CreditBill[], today: ISODate): CreditBill | null {
  const due = bills.filter(isBillDue)
  const overdue = due.find((b) => b.dueOn < today)
  if (overdue) return overdue
  return due.find((b) => b.dueOn >= today) ?? null
}

// ---------------------------------------------------------------------------------------
// O selo do lançamento

export interface EntryCreditStatus {
  /** Em quantas faturas a dívida está e quantas estão resolvidas (pagas, roladas, parceladas). */
  total: number
  settled: number
  /** O próximo vencimento ainda devido, ou o último, se tudo está resolvido. */
  dueOn: ISODate | null
  /** A fatura toda resolvida. É o "pago" da compra no cartão, derivado (invariante 7). */
  isPaid: boolean
}

const RESOLVED: ReadonlySet<CreditBillStatus> = new Set(['paid', 'rolled', 'carried'])

/** Em que faturas estão as cobranças de um lançamento, e quanto delas já foi pago. */
export function entryCreditStatus(entryId: string, bills: readonly CreditBill[]): EntryCreditStatus | null {
  let total = 0
  let settled = 0
  const open: ISODate[] = []
  const all: ISODate[] = []
  for (const bill of bills) {
    for (const charge of bill.charges) {
      if (charge.entryId !== entryId) continue
      total += 1
      all.push(bill.dueOn)
      if (RESOLVED.has(bill.status)) settled += 1
      else open.push(bill.dueOn)
    }
  }
  if (total === 0) return null
  const nextDue = open.length > 0 ? open.sort(compareISO)[0]! : null
  const lastDue = all.sort(compareISO)[all.length - 1]!
  return { total, settled, dueOn: nextDue ?? lastDue, isPaid: settled === total }
}

// ---------------------------------------------------------------------------------------
// O que a tela de lançamento precisa saber de cada conta

/** Uma conta como opção do "Pago com": o cadastro e o limite disponível agora. */
export interface CreditOption extends CreditAccount {
  /** `null` = sem limite. */
  availableCents: number | null
}

/**
 * As contas com o disponível de cada uma, para o seletor do [+] e da edição. A edição pede as
 * arquivadas também: o lançamento antigo de um cartão arquivado continua mostrando de onde veio
 * (o seletor só exibe a arquivada quando é a escolhida).
 */
export function toCreditOptions(
  accounts: readonly CreditAccount[],
  bills: readonly CreditBill[],
  includeArchived = false,
): CreditOption[] {
  return accounts
    .filter((account) => includeArchived || account.archivedAt === null)
    .map((account) => ({
      ...account,
      availableCents: availableLimitCents(
        account,
        bills.filter((bill) => bill.accountId === account.id),
      ),
    }))
}

/** Como a tela chama cada estado da fatura. */
export function billStatusLabel(status: CreditBillStatus, kind: CreditAccountKind): string {
  switch (status) {
    case 'open':
      return kind === 'card' ? 'Aberta' : 'A vencer'
    case 'closed':
      return 'Fechada'
    case 'overdue':
      return 'Vencida'
    case 'partial':
      return 'Paga em parte'
    case 'paid':
      return 'Paga'
    case 'rolled':
      return 'Restante na seguinte'
    case 'carried':
      return 'Parcelada'
  }
}
