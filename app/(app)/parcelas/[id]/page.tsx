import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Check, ChevronLeft, Clock } from 'lucide-react'
import { listCreditAccounts } from '@/lib/db/queries/credit'
import { listImportedDescriptions } from '@/lib/db/queries/entries'
import {
  getInstallmentKeywords,
  getInstallmentPlan,
  listPlanInstallments,
} from '@/lib/db/queries/installments'
import { formatCents } from '@/lib/finance/money'
import { todayISO } from '@/lib/finance/date'
import { PaidCountForm, PlanActions, PlanCreditForm, PlanKeywordsForm } from './actions'
import { cn } from '@/lib/utils'

/**
 * Um parcelamento. v1.1 — 2026-09-27.
 *
 * v1.1: "Quantas já foram pagas?" (`PaidCountForm`), para o parcelamento que entrou no app já
 * em andamento, sem precisar marcar parcela por parcela.
 *
 * v1.2 — 2026-09-27: "Palavras-chave do extrato" (`PlanKeywordsForm`) — a linha importada que
 * contém uma delas marca como paga a parcela pendente mais perto da data (migration 0019).
 *
 * v1.3 — 2026-09-27 (Fase 13): parcelamento no cartão (`PlanCreditForm`). Ali cada parcela
 * mostra a fatura em que cai, "paga" é a fatura paga, e "Quantas já foram pagas?" some — quem
 * paga é a fatura.
 */

// v1.2 — 27/09/2026: só o nome da tela; o "· Cass" vem do `template` do layout raiz.
export const metadata = { title: 'Parcelamento' }
export const dynamic = 'force-dynamic'

// v1.4 — 28/09/2026: layout de computador — a partir de `lg` (1024 px) a largura vai a `lg:max-w-3xl` (detalhe). No celular continua `max-w-md`.
export default async function ParcelamentoPage({
  params,
}: {
  // Next 16: `params` é assíncrono (invariante 12).
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const [plan, parcels, keywords, imported, accounts] = await Promise.all([
    getInstallmentPlan(id),
    listPlanInstallments(id),
    getInstallmentKeywords(id),
    listImportedDescriptions(),
    listCreditAccounts(),
  ])
  if (!plan) notFound()

  const today = todayISO()
  const paidCents = plan.totalAmountCents - plan.remainingCents
  const cards = accounts.filter((a) => a.kind === 'card')
  const card = accounts.find((a) => a.id === plan.creditAccountId) ?? null

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8 lg:max-w-3xl lg:px-10 lg:py-10">
      <div className="flex flex-col gap-2">
        <Link
          href="/parcelas"
          className="text-muted-foreground flex min-h-11 items-center gap-1 text-sm"
        >
          <ChevronLeft className="size-4" aria-hidden />
          Parcelas
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{plan.description}</h1>
        {card ? <p className="text-muted-foreground text-sm">No cartão {card.name}</p> : null}
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
                  {plan.creditAccountId && parcel.billDueOn && !parcel.isSettled
                    ? ` · fatura ${formatDue(parcel.billDueOn)}`
                    : ''}
                  {parcel.isSettled
                    ? ' · paga'
                    : plan.creditAccountId
                      ? ''
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
          Marque como paga pela agenda do Início ou pelo Histórico — cada parcela é um lançamento
          como qualquer outro. Para várias de uma vez, use o campo abaixo.
        </p>
      </section>

      {plan.creditAccountId ? null : (
        <PaidCountForm
          key={plan.paidCount}
          id={plan.planId}
          paidCount={plan.paidCount}
          installmentsCount={plan.installmentsCount}
        />
      )}

      {cards.length > 0 || plan.creditAccountId ? (
        <PlanCreditForm
          key={plan.creditAccountId ?? 'saldo'}
          id={plan.planId}
          creditAccountId={plan.creditAccountId}
          cards={cards.map((c) => ({ id: c.id, name: c.name }))}
        />
      ) : null}

      <PlanKeywordsForm
        key={keywords.join('|')}
        id={plan.planId}
        keywords={keywords}
        suggestions={imported.expense}
      />

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
