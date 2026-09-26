'use client'

import { useActionState } from 'react'
import { Check, Clock } from 'lucide-react'
import { toggleSettled, type EntryActionState } from '@/lib/actions/entries'
import type { EntryWithCategory } from '@/lib/db/queries/entries'
import { Money } from '@/components/finance/money'
import { cn } from '@/lib/utils'

const initialState: EntryActionState = {}

/**
 * Uma linha do extrato.
 *
 * O marcador de pendente é um ícone, e não só uma cor mais fraca: a regra de
 * `docs/DESIGN.md` é que pago e pendente precisem ser distinguíveis num relance,
 * inclusive por quem não distingue as cores.
 */
export function EntryRow({ entry }: { entry: EntryWithCategory }) {
  const [state, formAction, pending] = useActionState(toggleSettled, initialState)

  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <form action={formAction} className="shrink-0">
        <input type="hidden" name="id" value={entry.id} />
        <input type="hidden" name="isSettled" value={entry.isSettled ? 'false' : 'true'} />
        <button
          type="submit"
          disabled={pending}
          aria-label={entry.isSettled ? 'Marcar como pendente' : 'Marcar como pago'}
          title={state.error ?? undefined}
          className={cn(
            'flex size-11 items-center justify-center rounded-full border transition-colors disabled:opacity-50',
            entry.isSettled
              ? 'border-transparent bg-[var(--income-soft,var(--muted))] text-[var(--income)]'
              : 'border-input text-muted-foreground border-dashed',
          )}
        >
          {entry.isSettled ? (
            <Check className="size-5" aria-hidden />
          ) : (
            <Clock className="size-5" aria-hidden />
          )}
        </button>
      </form>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{entry.description}</p>
        <p className="text-muted-foreground truncate text-xs">
          {entry.category?.name ?? 'Sem categoria'}
          {entry.installmentNumber && entry.installmentTotal
            ? ` · ${entry.installmentNumber}/${entry.installmentTotal}`
            : ''}
          {entry.isSettled ? '' : ' · pendente'}
        </p>
      </div>

      <Money
        cents={entry.amountCents}
        kind={entry.kind}
        className={cn('shrink-0 text-sm', entry.isSettled ? '' : 'opacity-70')}
      />
    </li>
  )
}
