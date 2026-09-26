'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CalendarClock, Check, Repeat } from 'lucide-react'
import { toggleSettled, type EntryActionState } from '@/lib/actions/entries'
import { materializeRecurring, type RecurringActionState } from '@/lib/actions/recurring'
import {
  agendaItemKey,
  daysOverdue,
  sumAgendaCents,
  type AgendaItem,
  type AgendaSplit,
} from '@/lib/finance/agenda'
import { formatDayLabel } from '@/lib/finance/grouping'
import { formatCents } from '@/lib/finance/money'
import { Money } from '@/components/finance/money'
import { cn } from '@/lib/utils'

/**
 * Agenda de próximos eventos.
 *
 * Mistura duas origens que a pessoa lê como uma lista só: lançamentos pendentes
 * reais — inclusive as parcelas, que já são `entries` — e ocorrências de contas
 * fixas que ainda não viraram lançamento. Quem junta e deduplica é
 * `lib/db/queries/agenda.ts`; aqui a diferença só decide **qual ação** o botão
 * dispara.
 *
 * Calculada sempre, nunca condicionada a existir cenário ativo — era o bug do
 * `getUpcomingEvents()` antigo, em que a lista sumia inteira sem aviso.
 */

/** A forma que `toggleSettled` e `materializeRecurring` compartilham. */
type AgendaActionState = EntryActionState & RecurringActionState
type AgendaAction = (
  prev: AgendaActionState,
  formData: FormData,
) => Promise<AgendaActionState>

export function Upcoming({
  agenda,
  today,
}: {
  agenda: AgendaSplit<AgendaItem>
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
        <Link href="/lancamentos?status=pendente" className="text-xs text-[var(--brand)] underline">
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
                  {agenda.overdue.length === 1
                    ? '1 conta em atraso'
                    : `${agenda.overdue.length} contas em atraso`}
                  {' · '}
                  <span className="tabular">{formatCents(overdueTotal)}</span>
                </span>
              </div>
              <ul className="divide-border divide-y rounded-xl bg-[var(--surface)]">
                {agenda.overdue.map((item) => (
                  <AgendaRow key={agendaItemKey(item)} item={item} today={today} overdue />
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
                {agenda.upcoming.map((item) => (
                  <AgendaRow key={agendaItemKey(item)} item={item} today={today} overdue={false} />
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
 * O botão faz coisas diferentes conforme a origem, e é só nisso que as duas
 * diferem:
 *
 * - **lançamento real** → `toggleSettled`, um `update`;
 * - **ocorrência de conta fixa** → `materializeRecurring`, que cria a linha pela
 *   função do banco. Idempotente por construção: clicar duas vezes, ou em duas
 *   abas, continua gerando um lançamento só.
 *
 * As duas actions revalidam `/`, então a linha sai da agenda e o saldo se
 * atualiza na mesma resposta.
 */
function AgendaRow({
  item,
  today,
  overdue,
}: {
  item: AgendaItem
  today: string
  overdue: boolean
}) {
  // As duas actions têm a mesma assinatura de propósito, e o tipo abaixo diz
  // isso ao compilador em vez de um cast: se um dia uma delas mudar de forma,
  // o erro aparece aqui e não em produção.
  const action: AgendaAction = item.source === 'entry' ? toggleSettled : materializeRecurring
  const [state, formAction, pending] = useActionState(action, {})

  const late = daysOverdue(item.occurredOn, today)

  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <form action={formAction} className="shrink-0">
        {item.source === 'entry' ? (
          <>
            <input type="hidden" name="id" value={item.id} />
            <input type="hidden" name="isSettled" value="true" />
          </>
        ) : (
          <>
            <input type="hidden" name="ruleId" value={item.ruleId} />
            <input type="hidden" name="occursOn" value={item.occurredOn} />
          </>
        )}
        <button
          type="submit"
          disabled={pending}
          aria-label={item.kind === 'expense' ? 'Marcar como pago' : 'Marcar como recebido'}
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
        <p className="flex items-center gap-1.5 truncate text-sm font-medium">
          {/* O ícone marca o que ainda é previsão: a linha não existe no extrato
              até ser liquidada, e a pessoa precisa saber disso antes de procurar
              por ela lá. */}
          {item.source === 'recurring' ? (
            <Repeat className="text-muted-foreground size-3.5 shrink-0" aria-label="Conta fixa" />
          ) : null}
          <span className="truncate">{item.description}</span>
        </p>
        <p className="text-muted-foreground truncate text-xs">
          {overdue ? (
            <span className="text-[var(--expense)]">
              {late === 1 ? '1 dia de atraso' : `${late} dias de atraso`}
            </span>
          ) : (
            formatDayLabel(item.occurredOn, today)
          )}
          {item.categoryName ? ` · ${item.categoryName}` : ''}
        </p>
      </div>

      <Money cents={item.amountCents} kind={item.kind} className="shrink-0 text-sm" />
    </li>
  )
}
