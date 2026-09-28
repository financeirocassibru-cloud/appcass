import Link from 'next/link'
import { ChevronRight, CreditCard, Landmark, Plus } from 'lucide-react'
import { billsOf, getCreditLedger } from '@/lib/db/queries/credit'
import { billLabel, billStatusLabel, currentBill, usedLimitCents } from '@/lib/finance/credit'
import { todayISO } from '@/lib/finance/date'
import { formatCents } from '@/lib/finance/money'
import { formatDayMonth } from './format'
import { LimitMeter } from './limit-meter'

/**
 * Cartões e empréstimos — v1.0 — 2026-09-27 (Fase 13).
 *
 * Cada conta com a fatura que importa agora (a vencida, senão a próxima) e o limite. As
 * faturas não estão gravadas em lugar nenhum: saem de `getCreditLedger`, a mesma leitura que o
 * Início e a Análise usam — é por isso que o número daqui e o da agenda são o mesmo.
 */

export const metadata = { title: 'Cartões e empréstimos' }
export const dynamic = 'force-dynamic'

// v1.1 — 28/09/2026: layout de computador — a partir de `lg` (1024 px) a largura vai a `lg:max-w-4xl` (lista) e os cartões ficam em duas colunas. No celular continua `max-w-md`, uma coluna.
export default async function CartoesPage() {
  const today = todayISO()
  const ledger = await getCreditLedger(today)
  const active = ledger.accounts.filter((a) => a.archivedAt === null)
  const archived = ledger.accounts.filter((a) => a.archivedAt !== null)

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8 lg:max-w-4xl lg:px-10 lg:py-10">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Cartões e empréstimos</h1>
        <Link href="/cartoes/novo" className="shrink-0 text-sm font-medium text-[var(--brand)]">
          Novo
        </Link>
      </div>

      {active.length === 0 ? (
        <div className="flex flex-col gap-4 rounded-xl bg-[var(--surface)] p-5">
          <p className="text-sm text-[var(--foreground-muted)]">
            Gasto no cartão conta na categoria no dia em que foi feito, e sai do saldo só quando a
            fatura é paga — de uma vez, sem somar duas vezes. O mesmo vale para o que veio de um
            empréstimo. Cadastre aqui ou direto no [+], em &ldquo;Pago com&rdquo;.
          </p>
          <Link
            href="/cartoes/novo"
            className="bg-primary text-primary-foreground flex min-h-12 items-center justify-center gap-2 rounded-xl text-base font-semibold"
          >
            <Plus className="size-5" aria-hidden />
            Cadastrar o primeiro
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:gap-4">
          {active.map((account) => {
            const bills = billsOf(ledger, account.id)
            const bill = currentBill(bills, today)
            const Icon = account.kind === 'card' ? CreditCard : Landmark
            return (
              <li key={account.id}>
                <Link
                  href={{ pathname: '/cartoes/[id]', query: { id: account.id } }}
                  className="flex flex-col gap-3 rounded-xl bg-[var(--surface)] p-4 lg:h-full lg:transition-colors lg:hover:bg-[color-mix(in_srgb,var(--brand)_6%,var(--surface))]"
                >
                  <div className="flex items-center gap-3">
                    <Icon className="text-muted-foreground size-5 shrink-0" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{account.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {bill
                          ? `${billLabel(bill)} · vence ${formatDayMonth(bill.dueOn)} · ${billStatusLabel(bill.status, account.kind).toLowerCase()}`
                          : 'Nada a pagar'}
                      </p>
                    </div>
                    {bill ? (
                      <span className="tabular shrink-0 text-sm font-semibold">
                        {formatCents(bill.remainingCents)}
                      </span>
                    ) : null}
                    <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
                  </div>
                  {account.limitCents !== null ? (
                    <LimitMeter limitCents={account.limitCents} usedCents={usedLimitCents(bills)} />
                  ) : null}
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      {archived.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-muted-foreground text-sm font-semibold">Arquivados</h2>
          <ul className="divide-border divide-y rounded-xl bg-[var(--surface)]">
            {archived.map((account) => (
              <li key={account.id}>
                <Link
                  href={{ pathname: '/cartoes/[id]', query: { id: account.id } }}
                  className="flex min-h-11 items-center justify-between gap-3 px-4 py-3 text-sm"
                >
                  {account.name}
                  <ChevronRight className="text-muted-foreground size-4" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  )
}
