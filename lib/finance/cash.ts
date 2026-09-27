import type { ISODate } from './date'
import type { CreditBillLike, Entry, Occurrence } from './types'

/**
 * O lado "caixa" de cartões e empréstimos — v1.0 — 2026-09-27 (Fase 13).
 *
 * Separado de `credit.ts` só para a projeção poder usá-lo sem ciclo de import: `credit.ts`
 * importa `dedupeAgainstEntries` de `projection.ts`, e `projection.ts` importa daqui. Quem
 * não é a projeção importa de `credit.ts`, que reexporta tudo.
 */

/**
 * `true` quando o lançamento mexe no saldo por si mesmo. A SAÍDA financiada não mexe: quem
 * mexe é a fatura. Entrada financiada (o dinheiro do empréstimo) mexe — o dinheiro chegou.
 */
export function isCashEntry(entry: Pick<Entry, 'kind'> & { creditAccountId?: string | null }): boolean {
  return !(entry.creditAccountId && entry.kind === 'expense')
}

/** `true` quando o restante da fatura ainda é devido no próprio vencimento. */
export function isBillDue(bill: Pick<CreditBillLike, 'status' | 'remainingCents'>): boolean {
  return (
    bill.remainingCents > 0 &&
    (bill.status === 'open' ||
      bill.status === 'closed' ||
      bill.status === 'overdue' ||
      bill.status === 'partial')
  )
}

/** "Fatura Nubank" / "Empréstimo do banco" — como a fatura aparece na agenda e na Análise. */
export function billLabel(bill: Pick<CreditBillLike, 'accountKind' | 'accountName'>): string {
  return bill.accountKind === 'card' ? `Fatura ${bill.accountName}` : bill.accountName
}

/**
 * As faturas ainda devidas como saídas de caixa previstas, dentro de `[from, to]`. A vencida
 * vai para `from` (como `rollOverdueTo` faz com o pendente atrasado): continua devida.
 */
export function billOccurrences(
  bills: readonly CreditBillLike[],
  from: ISODate,
  to: ISODate,
): Occurrence[] {
  const result: Occurrence[] = []
  for (const bill of bills) {
    if (!isBillDue(bill)) continue
    const date = bill.dueOn < from ? from : bill.dueOn
    if (date > to) continue
    result.push({
      key: `bill:${bill.accountId}:${bill.dueOn}`,
      date,
      kind: 'expense',
      amountCents: bill.remainingCents,
      description: billLabel(bill),
      origin: 'credit_bill',
      sourceId: bill.accountId,
      categoryId: null,
      isRealized: false,
      isSettled: false,
    })
  }
  return result
}
