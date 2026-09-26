'use client'

import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import {
  createScenarioEntry,
  deleteScenarioEntry,
  type ScenarioActionState,
} from '@/lib/actions/scenarios'
import type { Scenario } from '@/lib/finance/types'
import { formatCents, popCentsDigit, pushCentsDigit } from '@/lib/finance/money'
import { Money } from '@/components/finance/money'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const initialState: ScenarioActionState = {}

/**
 * Itens que só existem dentro do cenário — o "e se eu comprasse um carro".
 *
 * Vivem em `scenario_entries`, nunca em `entries`. Apagar o cenário apaga os
 * itens junto e não deixa rastro no extrato.
 */
export function ScenarioEntries({ scenario, today }: { scenario: Scenario; today: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [cents, setCents] = useState(0)
  const [kind, setKind] = useState<'expense' | 'income'>('expense')

  const refreshOn = (result: ScenarioActionState) => {
    if (result.success) {
      toast.success(result.success)
      router.refresh()
    }
    return result
  }

  const [state, createAction, createPending] = useActionState(
    async (prev: ScenarioActionState, formData: FormData) => {
      const result = await createScenarioEntry(prev, formData)
      if (result.success) {
        setOpen(false)
        setCents(0)
      }
      return refreshOn(result)
    },
    initialState,
  )

  const [, deleteAction, deletePending] = useActionState(
    async (prev: ScenarioActionState, formData: FormData) =>
      refreshOn(await deleteScenarioEntry(prev, formData)),
    initialState,
  )

  return (
    <section aria-labelledby="titulo-hipoteticos" className="flex flex-col gap-3">
      <h2 id="titulo-hipoteticos" className="text-base font-semibold">
        Itens hipotéticos
      </h2>

      {scenario.entries.length > 0 ? (
        <ul className="divide-border divide-y rounded-xl bg-[var(--surface)]">
          {scenario.entries.map((entry) => (
            <li key={entry.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{entry.description}</p>
                <p className="text-muted-foreground text-xs">{formatDate(entry.occursOn)}</p>
              </div>
              <Money cents={entry.amountCents} kind={entry.kind} className="shrink-0 text-sm" />
              <form action={deleteAction} className="shrink-0">
                <input type="hidden" name="id" value={entry.id} />
                <button
                  type="submit"
                  disabled={deletePending}
                  aria-label={`Remover ${entry.description}`}
                  className="text-muted-foreground hover:text-[var(--destructive)] flex size-9 items-center justify-center rounded-full disabled:opacity-50"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl bg-[var(--surface)] p-4 text-sm text-[var(--foreground-muted)]">
          Nada hipotético ainda. Some aqui um gasto ou uma renda que você está considerando, e veja
          o efeito no saldo.
        </p>
      )}

      {open ? (
        <form action={createAction} className="bg-card border-border flex flex-col gap-3 rounded-xl border p-4">
          <input type="hidden" name="scenarioId" value={scenario.id} />
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="amountCents" value={cents} />

          <div role="radiogroup" aria-label="Tipo" className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1">
            {(['expense', 'income'] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={kind === option}
                onClick={() => setKind(option)}
                className={cn(
                  'min-h-11 rounded-md text-sm font-semibold transition-colors',
                  kind === option
                    ? option === 'expense'
                      ? 'bg-card text-[var(--expense)] shadow-sm'
                      : 'bg-card text-[var(--income)] shadow-sm'
                    : 'text-muted-foreground',
                )}
              >
                {option === 'expense' ? 'Gasto' : 'Renda'}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="hip-valor" className="text-muted-foreground text-xs font-medium">
              Valor
            </label>
            <input
              id="hip-valor"
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
            <Label htmlFor="hip-descricao">Descrição</Label>
            <Input
              id="hip-descricao"
              name="description"
              required
              maxLength={120}
              placeholder="Carro novo"
              className="min-h-11 text-base"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hip-data">Quando</Label>
            <Input
              id="hip-data"
              name="occursOn"
              type="date"
              required
              defaultValue={today}
              className="min-h-11 text-base"
            />
          </div>

          {state.error ? <p className="text-[var(--destructive)] text-xs">{state.error}</p> : null}

          <div className="flex gap-2">
            <Button type="submit" disabled={createPending || cents === 0} className="min-h-11 flex-1">
              {createPending ? 'Somando…' : 'Somar ao cenário'}
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
          Somar um item hipotético
        </Button>
      )}
    </section>
  )
}

/** `dd/mm/aaaa` sem passar por `Date` no fuso local. */
function formatDate(date: string): string {
  const [year, month, day] = date.split('-')
  return `${day}/${month}/${year}`
}
