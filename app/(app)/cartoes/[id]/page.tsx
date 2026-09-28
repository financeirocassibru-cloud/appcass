import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { billsOf, getCreditLedger } from '@/lib/db/queries/credit'
import { listImportedDescriptions } from '@/lib/db/queries/entries'
import {
  billStatusLabel,
  isBillDue,
  nextDueAfter,
  usedLimitCents,
  type CreditBill,
} from '@/lib/finance/credit'
import { todayISO } from '@/lib/finance/date'
import { formatCents } from '@/lib/finance/money'
import { cn } from '@/lib/utils'
import { formatDay, formatDayMonth } from '../format'
import { LimitMeter } from '../limit-meter'
import { AccountSettings, BillActions } from './bill-actions'

/**
 * Um cartão ou empréstimo e as faturas dele — v1.0 — 2026-09-27 (Fase 13).
 *
 * Primeiro o que ainda é devido (vencida, fechada, aberta, as futuras), com Pagar e Parcelar;
 * depois as já resolvidas, as mais recentes. Cada fatura lista as cobranças que a compõem —
 * a compra com a data em que foi feita — e os pagamentos, e diz de onde veio o que rolou da
 * anterior. Os juros aparecem como o que passou do total, e é isso que vai para "Juros e
 * encargos" na Análise.
 */

export const metadata = { title: 'Cartão' }
export const dynamic = 'force-dynamic'

const RESOLVED_SHOWN = 6

// v1.1 — 28/09/2026: layout de computador — a partir de `lg` (1024 px) a largura vai a `lg:max-w-3xl` (detalhe). No celular continua `max-w-md`.
export default async function CartaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const today = todayISO()
  const [ledger, imported] = await Promise.all([getCreditLedger(today), listImportedDescriptions()])
  const account = ledger.accounts.find((a) => a.id === id)
  if (!account) notFound()

  const bills = billsOf(ledger, account.id)
  const due = bills.filter(isBillDue)
  const resolved = bills.filter((b) => !isBillDue(b)).reverse().slice(0, RESOLVED_SHOWN)
  const isCard = account.kind === 'card'

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8 lg:max-w-3xl lg:px-10 lg:py-10">
      <div className="flex flex-col gap-2">
        <Link href="/cartoes" className="text-muted-foreground flex min-h-11 items-center gap-1 text-sm">
          <ChevronLeft className="size-4" aria-hidden />
          Cartões e empréstimos
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{account.name}</h1>
        <p className="text-muted-foreground text-sm">
          {isCard
            ? `Cartão · fecha dia ${account.closingDay}, vence dia ${account.dueDay}`
            : account.dueOn
              ? `Empréstimo · vence em ${formatDay(account.dueOn)}`
              : account.dueDay
                ? `Empréstimo · vence todo dia ${account.dueDay}`
                : 'Empréstimo · vencimento escolhido a cada uso'}
          {account.archivedAt ? ' · arquivado' : ''}
        </p>
      </div>

      {account.limitCents !== null ? (
        <div className="rounded-xl bg-[var(--surface)] p-4">
          <LimitMeter limitCents={account.limitCents} usedCents={usedLimitCents(bills)} />
        </div>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">{isCard ? 'Faturas a pagar' : 'A pagar'}</h2>
        {due.length === 0 ? (
          <p className="text-muted-foreground rounded-xl bg-[var(--surface)] p-4 text-sm">
            Nada a pagar. Os gastos com &ldquo;Pago com: {account.name}&rdquo; no [+] aparecem aqui,
            na fatura em que caem.
          </p>
        ) : (
          due.map((bill) => (
            <BillCard key={bill.dueOn} bill={bill} today={today}>
              <BillActions
                accountId={account.id}
                dueOn={bill.dueOn}
                remainingCents={bill.remainingCents}
                today={today}
                nextDue={nextDueAfter(account, bill.dueOn)}
                canCarry={bill.dueOn <= nextDueAfter(account, today)}
              />
            </BillCard>
          ))
        )}
      </section>

      {resolved.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">Pagas e resolvidas</h2>
          {resolved.map((bill) => (
            <BillCard key={bill.dueOn} bill={bill} today={today} />
          ))}
        </section>
      ) : null}

      <AccountSettings account={account} suggestions={imported.expense} />
    </main>
  )
}

function BillCard({
  bill,
  today,
  children,
}: {
  bill: CreditBill
  today: string
  children?: React.ReactNode
}) {
  const interest = bill.payments.reduce((sum, p) => sum + p.interestCents, 0)
  return (
    <article className="flex flex-col gap-3 rounded-xl bg-[var(--surface)] p-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Vence {formatDay(bill.dueOn)}</p>
          <p className={cn('text-xs', bill.status === 'overdue' ? 'text-[var(--expense)]' : 'text-muted-foreground')}>
            {billStatusLabel(bill.status, bill.accountKind)}
            {bill.closingOn && bill.closingOn >= today ? ` · fecha ${formatDayMonth(bill.closingOn)}` : ''}
          </p>
        </div>
        <div className="text-right">
          <p className="tabular text-base font-semibold">{formatCents(Math.max(0, bill.remainingCents))}</p>
          {bill.paidCents > 0 ? (
            <p className="text-muted-foreground tabular text-xs">de {formatCents(bill.totalCents)}</p>
          ) : null}
        </div>
      </header>

      {bill.charges.length > 0 || bill.carryInCents > 0 || bill.payments.length > 0 ? (
        <ul className="divide-border flex flex-col divide-y text-sm">
          {bill.carryInCents > 0 ? (
            <li className="flex items-center justify-between gap-3 py-1.5">
              <span className="text-muted-foreground">Restante da fatura anterior</span>
              <span className="tabular">{formatCents(bill.carryInCents)}</span>
            </li>
          ) : null}
          {bill.charges.map((charge, index) => (
            <li key={`${charge.entryId ?? charge.ruleId}-${charge.number}-${index}`} className="flex items-center justify-between gap-3 py-1.5">
              <span className="min-w-0 truncate">
                {charge.description}
                <span className="text-muted-foreground text-xs">
                  {' · '}
                  {formatDayMonth(charge.occurredOn)}
                  {charge.total > 1 ? ` · ${charge.number}/${charge.total}` : ''}
                  {charge.entryId === null ? ' · prevista' : ''}
                </span>
              </span>
              <span className="tabular shrink-0">{formatCents(charge.amountCents)}</span>
            </li>
          ))}
          {bill.payments.map((payment) => (
            <li key={payment.entryId} className="flex items-center justify-between gap-3 py-1.5 text-[var(--income)]">
              <span>Pagamento · {formatDayMonth(payment.paidOn)}</span>
              <span className="tabular">−{formatCents(payment.amountCents - payment.interestCents)}</span>
            </li>
          ))}
          {interest > 0 ? (
            <li className="text-muted-foreground flex items-center justify-between gap-3 py-1.5">
              <span>Juros e encargos pagos</span>
              <span className="tabular">{formatCents(interest)}</span>
            </li>
          ) : null}
        </ul>
      ) : null}

      {children}
    </article>
  )
}
