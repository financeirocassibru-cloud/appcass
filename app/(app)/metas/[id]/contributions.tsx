'use client'

import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import {
  createContribution,
  deleteContribution,
  type GoalActionState,
} from '@/lib/actions/goals'
import type { Contribution } from '@/lib/db/queries/goals'
import { formatCents, popCentsDigit, pushCentsDigit } from '@/lib/finance/money'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const initialState: GoalActionState = {}

/**
 * Aportes e resgates da meta.
 *
 * Resgate é um aporte **negativo**, não a exclusão de um aporte anterior: o
 * dinheiro entrou de verdade e depois saiu de verdade, e as duas coisas são
 * história. O total continua sendo a soma, qualquer que seja o sinal —
 * invariante 7, e o que o app antigo perdia ao guardar um acumulado solto.
 */
export function ContributionsPanel({
  goalId,
  contributions,
  today,
}: {
  goalId: string
  contributions: Contribution[]
  today: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [cents, setCents] = useState(0)
  const [isWithdrawal, setIsWithdrawal] = useState(false)

  const refreshOn = (result: GoalActionState) => {
    if (result.success) {
      toast.success(result.success)
      router.refresh()
    }
    return result
  }

  const [state, createAction, createPending] = useActionState(
    async (prev: GoalActionState, formData: FormData) => {
      const result = await createContribution(prev, formData)
      if (result.success) {
        setOpen(false)
        setCents(0)
      }
      return refreshOn(result)
    },
    initialState,
  )

  const [, deleteAction, deletePending] = useActionState(
    async (prev: GoalActionState, formData: FormData) =>
      refreshOn(await deleteContribution(prev, formData)),
    initialState,
  )

  return (
    <section aria-labelledby="titulo-aportes" className="flex flex-col gap-3">
      <h2 id="titulo-aportes" className="text-base font-semibold">
        Aportes
      </h2>

      {contributions.length > 0 ? (
        <ul className="divide-border divide-y rounded-xl bg-[var(--surface)]">
          {contributions.map((contribution) => {
            const isOut = contribution.amountCents < 0
            return (
              <li key={contribution.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {isOut ? 'Resgate' : 'Aporte'}
                    {contribution.note ? ` · ${contribution.note}` : ''}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {formatDate(contribution.occurredOn)}
                  </p>
                </div>
                <span
                  className={cn(
                    'tabular shrink-0 text-sm font-semibold',
                    isOut ? 'text-[var(--expense)]' : 'text-[var(--income)]',
                  )}
                >
                  {isOut ? '−' : '+'} {formatCents(Math.abs(contribution.amountCents))}
                </span>
                <form action={deleteAction} className="shrink-0">
                  <input type="hidden" name="id" value={contribution.id} />
                  <button
                    type="submit"
                    disabled={deletePending}
                    aria-label="Excluir este registro"
                    className="text-muted-foreground hover:text-[var(--destructive)] flex size-9 items-center justify-center rounded-full disabled:opacity-50"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </form>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="rounded-xl bg-[var(--surface)] p-4 text-sm text-[var(--foreground-muted)]">
          Nenhum aporte ainda. Registre aqui o dinheiro que você separar para esta meta.
        </p>
      )}

      {open ? (
        <form action={createAction} className="bg-card border-border flex flex-col gap-3 rounded-xl border p-4">
          <input type="hidden" name="goalId" value={goalId} />
          <input type="hidden" name="isWithdrawal" value={isWithdrawal ? 'true' : 'false'} />
          <input type="hidden" name="amountCents" value={cents} />

          <div role="radiogroup" aria-label="Tipo" className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1">
            {[false, true].map((withdrawal) => (
              <button
                key={withdrawal ? 'resgate' : 'aporte'}
                type="button"
                role="radio"
                aria-checked={isWithdrawal === withdrawal}
                onClick={() => setIsWithdrawal(withdrawal)}
                className={cn(
                  'min-h-11 rounded-md text-sm font-semibold transition-colors',
                  isWithdrawal === withdrawal
                    ? withdrawal
                      ? 'bg-card text-[var(--expense)] shadow-sm'
                      : 'bg-card text-[var(--income)] shadow-sm'
                    : 'text-muted-foreground',
                )}
              >
                {withdrawal ? 'Tirei' : 'Guardei'}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="aporte-valor" className="text-muted-foreground text-xs font-medium">
              Quanto
            </label>
            <input
              id="aporte-valor"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              value={formatCents(cents)}
              onKeyDown={(event) => {
                if (event.key === 'Backspace') {
                  event.preventDefault()
                  setCents(popCentsDigit)
                  return
                }
                if (/^[0-9]$/.test(event.key)) {
                  event.preventDefault()
                  setCents((current) => pushCentsDigit(current, event.key))
                  return
                }
                if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
                  event.preventDefault()
                }
              }}
              onChange={() => undefined}
              className={cn(
                'tabular border-input bg-card focus-visible:border-primary focus-visible:ring-ring/25',
                'min-h-12 rounded-lg border px-3 text-xl font-bold outline-none focus-visible:ring-2',
              )}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="aporte-data">Quando</Label>
            <Input
              id="aporte-data"
              name="occurredOn"
              type="date"
              required
              defaultValue={today}
              className="min-h-11 text-base"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="aporte-nota">Observação (opcional)</Label>
            <Input
              id="aporte-nota"
              name="note"
              maxLength={200}
              placeholder="Décimo terceiro"
              className="min-h-11 text-base"
            />
          </div>

          {state.error ? <p className="text-[var(--destructive)] text-xs">{state.error}</p> : null}

          <div className="flex gap-2">
            <Button type="submit" disabled={createPending || cents === 0} className="min-h-11 flex-1">
              {createPending ? 'Registrando…' : 'Registrar'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} className="min-h-11">
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={() => setOpen(true)}
          className="min-h-12 justify-center gap-2"
        >
          <Plus className="size-4" aria-hidden />
          Registrar aporte
        </Button>
      )}

      <p className="text-muted-foreground text-xs">
        O aporte não vira lançamento no extrato: guardar dinheiro costuma ser uma transferência
        entre contas suas, não um gasto. Tratá-lo como gasto faria o saldo cair duas vezes quando a
        compra finalmente acontecesse.
      </p>
    </section>
  )
}

/** `dd/mm/aaaa` sem passar por `Date` no fuso local. */
function formatDate(date: string): string {
  const [year, month, day] = date.split('-')
  return `${day}/${month}/${year}`
}
