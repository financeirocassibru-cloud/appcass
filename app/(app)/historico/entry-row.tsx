'use client'

import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Clock, CreditCard, Landmark } from 'lucide-react'
import { toast } from 'sonner'
import { toggleSettled, type EntryActionState } from '@/lib/actions/entries'
import type { Category } from '@/lib/db/queries/categories'
import type { EntryWithCategory } from '@/lib/db/queries/entries'
import type { EntryKind } from '@/lib/db/types'
import type { CreditOption } from '@/lib/finance/credit'
import { EntryForm } from '@/components/finance/entry-form'
import { Money } from '@/components/finance/money'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

const initialState: EntryActionState = {}

/**
 * Uma linha do Histórico.
 *
 * v1.1 — 2026-09-26: a linha passou a abrir a edição. O marcador de pendente continua sendo um
 * ícone, e não só uma cor mais fraca: a regra de `docs/DESIGN.md` é que pago e pendente sejam
 * distinguíveis num relance, inclusive por quem não distingue as cores.
 *
 * São dois alvos de toque separados, e isso é deliberado: o círculo à esquerda alterna
 * pago/pendente — a ação mais usada da tela, que não pode custar dois toques —, e o resto da
 * linha abre o painel de edição. Um alvo só obrigaria a escolher entre as duas.
 *
 * v1.2 — 2026-09-27: repassa ao formulário as sugestões de palavra-chave (descrições
 * importadas).
 *
 * v1.3 — 2026-09-27 (Fase 13): a compra no cartão/empréstimo não tem o círculo de pago — quem
 * a conclui é a fatura. No lugar dele, o ícone da conta, com o check quando a fatura dela foi
 * paga; e a linha diz de onde veio e quando é paga.
 */

/** v1.3 — 2026-09-27: de onde veio o dinheiro e em que pé está a fatura. */
export interface EntryCreditBadge {
  accountName: string
  accountKind: 'card' | 'loan'
  /** O próximo vencimento ainda devido (ou o último, se tudo foi pago). */
  dueOn: string | null
  isPaid: boolean
  paidCount: number
  chargeCount: number
}
export function EntryRow({
  entry,
  expenseCategories,
  incomeCategories,
  today,
  suggestions,
  credit = null,
  creditAccounts,
}: {
  entry: EntryWithCategory
  expenseCategories: Category[]
  incomeCategories: Category[]
  today: string
  suggestions?: Record<EntryKind, string[]>
  credit?: EntryCreditBadge | null
  creditAccounts?: CreditOption[]
}) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState(toggleSettled, initialState)
  const [editing, setEditing] = useState(false)

  // A saída no cartão não se marca como paga aqui: a fatura a conclui.
  const fundedExpense = credit !== null && entry.kind === 'expense'
  const settledShown = fundedExpense ? credit.isPaid : entry.isSettled
  const CreditIcon = credit?.accountKind === 'loan' ? Landmark : CreditCard

  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      {fundedExpense ? (
        <span
          role="img"
          aria-label={
            credit.isPaid
              ? `Pago pela fatura de ${credit.accountName}`
              : `No ${credit.accountName}, a pagar pela fatura`
          }
          className={cn(
            'relative flex size-11 shrink-0 items-center justify-center rounded-full border',
            credit.isPaid
              ? 'border-transparent bg-[var(--income-soft,var(--muted))] text-[var(--income)]'
              : 'border-input text-muted-foreground border-dashed',
          )}
        >
          <CreditIcon className="size-5" aria-hidden />
          {credit.isPaid ? (
            <Check className="bg-card absolute -right-0.5 -bottom-0.5 size-4 rounded-full" aria-hidden />
          ) : null}
        </span>
      ) : (
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
      )}

      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{entry.description}</span>
          <span className="text-muted-foreground block truncate text-xs">
            {entry.category?.name ?? 'Sem categoria'}
            {entry.installmentNumber && entry.installmentTotal
              ? ` · ${entry.installmentNumber}/${entry.installmentTotal}`
              : ''}
            {credit
              ? ` · ${credit.accountName}${
                  fundedExpense
                    ? credit.isPaid
                      ? ' · pago'
                      : credit.dueOn
                        ? ` · ${credit.chargeCount > 1 ? `${credit.paidCount}/${credit.chargeCount} · próxima ` : 'paga em '}${credit.dueOn.slice(8, 10)}/${credit.dueOn.slice(5, 7)}`
                        : ''
                    : ''
                }`
              : ''}
            {settledShown || fundedExpense ? '' : ' · pendente'}
          </span>
        </span>

        <Money
          cents={entry.amountCents}
          kind={entry.kind}
          className={cn('shrink-0 text-sm', settledShown ? '' : 'opacity-70')}
        />
      </button>

      <Sheet open={editing} onOpenChange={setEditing}>
        <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto px-6 pt-6 pb-8">
          <SheetHeader className="px-0">
            <SheetTitle>Editar lançamento</SheetTitle>
            <SheetDescription>
              Altere o que precisar, ou exclua no fim do formulário.
            </SheetDescription>
          </SheetHeader>

          <EntryForm
            key={entry.id}
            mode="edit"
            entry={entry}
            expenseCategories={expenseCategories}
            incomeCategories={incomeCategories}
            today={today}
            suggestions={suggestions}
            creditAccounts={creditAccounts}
            onDone={(result) => {
              toast.success(
                result === 'deleted' ? 'Lançamento excluído.' : 'Lançamento atualizado.',
              )
              setEditing(false)
              // `revalidatePath` na action atualiza o cache do servidor; o `refresh` é o que
              // faz esta árvore, já montada, buscar a versão nova.
              router.refresh()
            }}
          />
        </SheetContent>
      </Sheet>
    </li>
  )
}
