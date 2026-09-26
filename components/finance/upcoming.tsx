'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CalendarClock, Check } from 'lucide-react'
import { toggleSettled, type EntryActionState } from '@/lib/actions/entries'
import type { EntryWithCategory } from '@/lib/db/queries/entries'
import { daysOverdue, sumAgendaCents, type AgendaSplit } from '@/lib/finance/agenda'
import { formatDayLabel } from '@/lib/finance/grouping'
import { formatCents } from '@/lib/finance/money'
import { Money } from '@/components/finance/money'
import { cn } from '@/lib/utils'

/**
 * Agenda de próximos eventos.
 *
 * Calculada sempre, a partir dos lançamentos pendentes — nunca condicionada a
 * existir um cenário ativo, que era o bug do `getUpcomingEvents()` antigo: sem
 * ciclo, a lista sumia inteira e a pessoa achava que não tinha nada vencendo.
 *
 * Contas fixas e parcelas entram nesta lista na fase 4, quando tiverem tela.
 * Hoje só existem lançamentos, e a agenda diz isso em vez de fingir cobertura
 * que não tem.
 */

const initialState: EntryActionState = {}

export function Upcoming({
  agenda,
  today,
}: {
  agenda: AgendaSplit<EntryWithCategory>
  today: string
}) {
  const overdueTotal = sumAgendaCents(agenda.overdue)
  const isEmpty = agenda.overdue.length === 0 && agenda.upcoming.length === 0

  return (
    <section aria-labelledby="titulo-agenda" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="titulo-agenda" className="text-base font-semibold">
          A vencer
        </h2>
        <Link
          href="/lancamentos?status=pendente"
          className="text-xs text-[var(--brand)] underline"
        >
          Ver tudo
        </Link>
      </div>

      {isEmpty ? (
        <p className="rounded-xl bg-[var(--surface)] p-4 text-sm text-[var(--foreground-muted)]">
          Nada vencendo nos próximos 30 dias.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {agenda.overdue.length > 0 ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-sm font-medium text-[var(--expense)]">
                <AlertTriangle className="size-4" aria-hidden />
                <span>
                  {agenda.overdue.length === 1 ? '1 conta em atraso' : `${agenda.overdue.length} contas em atraso`}
                  {' · '}
                  <span className="tabular">{formatCents(overdueTotal)}</span>
                </span>
              </div>
              <ul className="divide-border divide-y rounded-xl bg-[var(--surface)]">
                {agenda.overdue.map((entry) => (
                  <AgendaRow key={entry.id} entry={entry} today={today} overdue />
                ))}
              </ul>
            </div>
          ) : null}

          {agenda.upcoming.length > 0 ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-sm font-medium text-[var(--foreground-muted)]">
                <CalendarClock className="size-4" aria-hidden />
                <span>Próximos 30 dias</span>
              </div>
              <ul className="divide-border divide-y rounded-xl bg-[var(--surface)]">
                {agenda.upcoming.map((entry) => (
                  <AgendaRow key={entry.id} entry={entry} today={today} overdue={false} />
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </section>
  )
}

/**
 * Uma linha da agenda, com a ação de liquidar ali mesmo.
 *
 * Reusa `toggleSettled`: resolver na agenda é o caminho mais curto, e é o que a
 * pessoa quer fazer quando vê a lista. A action já revalida `/`, então a linha
 * sai da agenda e o saldo se atualiza na mesma resposta.
 */
function AgendaRow({
  entry,
  today,
  overdue,
}: {
  entry: EntryWithCategory
  today: string
  overdue: boolean
}) {
  const [state, formAction, pending] = useActionState(toggleSettled, initialState)
  const late = daysOverdue(entry.occurredOn, today)

  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <form action={formAction} className="shrink-0">
        <input type="hidden" name="id" value={entry.id} />
        <input type="hidden" name="isSettled" value="true" />
        <button
          type="submit"
          disabled={pending}
          aria-label={entry.kind === 'expense' ? 'Marcar como pago' : 'Marcar como recebido'}
          title={state.error ?? undefined}
          className={cn(
            'border-input text-muted-foreground hover:border-[var(--income)] hover:text-[var(--income)]',
            'flex size-11 items-center justify-center rounded-full border border-dashed transition-colors disabled:opacity-50',
          )}
        >
          <Check className="size-5" aria-hidden />
        </button>
      </form>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{entry.description}</p>
        <p className="text-muted-foreground truncate text-xs">
          {overdue ? (
            <span className="text-[var(--expense)]">
              {late === 1 ? '1 dia de atraso' : `${late} dias de atraso`}
            </span>
          ) : (
            formatDayLabel(entry.occurredOn, today)
          )}
          {entry.category ? ` · ${entry.category.name}` : ''}
        </p>
      </div>

      <Money cents={entry.amountCents} kind={entry.kind} className="shrink-0 text-sm" />
    </li>
  )
}
