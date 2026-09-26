'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, Pencil, Trash2 } from 'lucide-react'
import {
  activateScenario,
  deleteScenario,
  renameScenario,
  type ScenarioActionState,
} from '@/lib/actions/scenarios'
import type { ScenarioSummary } from '@/lib/db/queries/scenarios'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const initialState: ScenarioActionState = {}

/**
 * Uma linha da lista de cenários.
 *
 * O contador de ajustes é o que diz se o cenário ainda faz alguma coisa: um
 * cenário sem override e sem item é idêntico à projeção real, e mostrar isso
 * evita a confusão de "criei e não mudou nada".
 */
export function ScenarioRow({ scenario }: { scenario: ScenarioSummary }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)

  const refreshOn = (result: ScenarioActionState) => {
    if (result.success) {
      toast.success(result.success)
      router.refresh()
    }
    return result
  }

  const [renameState, renameAction, renamePending] = useActionState(
    async (prev: ScenarioActionState, formData: FormData) => {
      const result = await renameScenario(prev, formData)
      if (result.success) setEditing(false)
      return refreshOn(result)
    },
    initialState,
  )

  const [, activateAction, activatePending] = useActionState(
    async (prev: ScenarioActionState, formData: FormData) =>
      refreshOn(await activateScenario(prev, formData)),
    initialState,
  )

  const [, deleteAction, deletePending] = useActionState(
    async (prev: ScenarioActionState, formData: FormData) =>
      refreshOn(await deleteScenario(prev, formData)),
    initialState,
  )

  const adjustments = scenario.overrideCount + scenario.entryCount

  return (
    <li className="flex flex-col gap-3 rounded-xl bg-[var(--surface)] p-4">
      {editing ? (
        <form action={renameAction} className="flex flex-col gap-2">
          <input type="hidden" name="id" value={scenario.id} />
          <Input
            name="name"
            required
            maxLength={60}
            defaultValue={scenario.name}
            aria-label="Nome do cenário"
            className="min-h-11 text-base"
          />
          {renameState.error ? (
            <p className="text-[var(--destructive)] text-xs">{renameState.error}</p>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" disabled={renamePending} className="min-h-11 flex-1">
              {renamePending ? 'Salvando…' : 'Salvar'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setEditing(false)}
              className="min-h-11"
            >
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-sm font-medium">
              <span className="truncate">{scenario.name}</span>
              {scenario.isActive ? (
                <span className="shrink-0 rounded-full bg-[var(--surface-raised)] px-2 py-0.5 text-xs font-normal text-[var(--brand)]">
                  padrão
                </span>
              ) : null}
            </p>
            <p className="text-muted-foreground text-xs">
              {formatRange(scenario.startsOn, scenario.endsOn)}
              {' · '}
              {adjustments === 0
                ? 'sem ajustes — igual à projeção real'
                : `${adjustments} ${adjustments === 1 ? 'ajuste' : 'ajustes'}`}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label={`Renomear ${scenario.name}`}
            className="text-muted-foreground hover:text-foreground flex size-11 shrink-0 items-center justify-center rounded-full"
          >
            <Pencil className="size-4" aria-hidden />
          </button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Link
          href={{ pathname: '/projecao', query: { cenario: scenario.id } }}
          className="bg-primary text-primary-foreground flex min-h-11 flex-1 items-center justify-center rounded-lg text-sm font-semibold"
        >
          Abrir na projeção
        </Link>

        {!scenario.isActive ? (
          <form action={activateAction}>
            <input type="hidden" name="id" value={scenario.id} />
            <button
              type="submit"
              disabled={activatePending}
              aria-label={`Definir ${scenario.name} como padrão`}
              title="Definir como padrão"
              className={cn(
                'border-input text-muted-foreground hover:text-[var(--brand)]',
                'flex size-11 items-center justify-center rounded-lg border disabled:opacity-50',
              )}
            >
              <Check className="size-4" aria-hidden />
            </button>
          </form>
        ) : null}

        <form
          action={deleteAction}
          onSubmit={(event) => {
            if (
              !window.confirm(
                `Excluir "${scenario.name}"? Seus lançamentos continuam como estão.`,
              )
            ) {
              event.preventDefault()
            }
          }}
        >
          <input type="hidden" name="id" value={scenario.id} />
          <button
            type="submit"
            disabled={deletePending}
            aria-label={`Excluir ${scenario.name}`}
            className="border-input text-[var(--destructive)] flex size-11 items-center justify-center rounded-lg border disabled:opacity-50"
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        </form>
      </div>
    </li>
  )
}

/** `dd/mm/aa → dd/mm/aa`, sem passar por `Date` no fuso local. */
function formatRange(from: string, to: string): string {
  const short = (date: string) => {
    const [year, month, day] = date.split('-')
    return `${day}/${month}/${year?.slice(2)}`
  }
  return `${short(from)} → ${short(to)}`
}
