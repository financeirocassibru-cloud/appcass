import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Check, ChevronLeft, Clock } from 'lucide-react'
import { getInstallmentPlan, listPlanInstallments } from '@/lib/db/queries/installments'
import { formatCents } from '@/lib/finance/money'
import { todayISO } from '@/lib/finance/date'
import { PlanActions } from './actions'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Parcelamento · Finanças' }
export const dynamic = 'force-dynamic'

export default async function ParcelamentoPage({
  params,
}: {
  // Next 16: `params` é assíncrono (invariante 12).
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const [plan, parcels] = await Promise.all([getInstallmentPlan(id), listPlanInstallments(id)])
  if (!plan) notFound()

  const today = todayISO()
  const paidCents = plan.totalAmountCents - plan.remainingCents

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
      <div className="flex flex-col gap-2">
        <Link
          href="/parcelas"
          className="text-muted-foreground flex min-h-11 items-center gap-1 text-sm"
        >
          <ChevronLeft className="size-4" aria-hidden />
          Parcelas
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{plan.description}</h1>
      </div>

      <dl className="grid grid-cols-2 gap-4 rounded-xl bg-[var(--surface)] p-4">
        <div>
          <dt className="text-xs text-[var(--foreground-muted)]">Total</dt>
          <dd className="tabular text-base font-semibold">{formatCents(plan.totalAmountCents)}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--foreground-muted)]">Já pago</dt>
          <dd className="tabular text-base font-semibold">{formatCents(paidCents)}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--foreground-muted)]">Falta</dt>
          <dd className="tabular text-base font-semibold">{formatCents(plan.remainingCents)}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--foreground-muted)]">Parcelas pagas</dt>
          {/* Contagem derivada da view, que conta lançamentos liquidados — nunca
              um contador guardado (invariante 7). */}
          <dd className="tabular text-base font-semibold">
            {plan.paidCount} de {plan.installmentsCount}
          </dd>
        </div>
      </dl>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">Parcelas</h2>
        <ul className="divide-border divide-y rounded-xl bg-[var(--surface)]">
          {parcels.map((parcel) => (
            <li key={parcel.id} className="flex items-center gap-3 px-4 py-2.5">
              <span
                aria-hidden
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full',
                  parcel.isSettled
                    ? 'bg-[var(--income-soft,var(--muted))] text-[var(--income)]'
                    : 'border-input text-muted-foreground border border-dashed',
                )}
              >
                {parcel.isSettled ? (
                  <Check className="size-4" />
                ) : (
                  <Clock className="size-4" />
                )}
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {parcel.number}/{parcel.total}
                </p>
                <p className="text-muted-foreground text-xs">
                  {formatDue(parcel.dueOn)}
                  {parcel.isSettled
                    ? ' · paga'
                    : parcel.dueOn < today
                      ? ' · em atraso'
                      : ' · pendente'}
                </p>
              </div>

              <span
                className={cn('tabular shrink-0 text-sm', !parcel.isSettled && 'opacity-70')}
              >
                {formatCents(parcel.amountCents)}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground text-xs">
          Marque como paga pela agenda do Início ou pelo extrato — cada parcela é um lançamento
          como qualquer outro.
        </p>
      </section>

      <PlanActions
        id={plan.planId}
        paidCount={plan.paidCount}
        pendingCount={plan.installmentsCount - plan.paidCount}
      />
    </main>
  )
}

/** `dd/mm/aaaa` sem passar por `Date` no fuso local. */
function formatDue(date: string): string {
  const [year, month, day] = date.split('-')
  return `${day}/${month}/${year}`
}
