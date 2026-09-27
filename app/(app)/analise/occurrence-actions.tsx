'use client'

import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { RotateCcw, SlidersHorizontal, X } from 'lucide-react'
import {
  removeOverride,
  setOverride,
  type ScenarioActionState,
} from '@/lib/actions/scenarios'
import type { OverrideTargetRef } from '@/lib/finance/projection'
import { formatCents, popCentsDigit, pushCentsDigit } from '@/lib/finance/money'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const initialState: ScenarioActionState = {}

/**
 * Ajustes de uma ocorrência dentro do cenário.
 *
 * Três operações, e todas gravam em `scenario_overrides` — **nenhuma toca no
 * lançamento real**. É a diferença que define esta fase: no app antigo, mexer
 * num valor dentro do planejamento sobrescrevia o dado verdadeiro e não havia
 * como voltar.
 *
 * O alvo vem de `overrideTargetOf()` no servidor e viaja em campos escondidos.
 * A tela não recalcula o alvo por conta própria: um alvo montado de outro jeito
 * não casaria na leitura, e o ajuste simplesmente não faria efeito.
 */
export function OccurrenceActions({
  scenarioId,
  target,
  description,
  currentAmountCents,
  currentDate,
  isAdjusted,
}: {
  scenarioId: string
  target: OverrideTargetRef
  description: string
  currentAmountCents: number
  currentDate: string
  /** `true` quando já existe um override para esta ocorrência. */
  isAdjusted: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [cents, setCents] = useState(currentAmountCents)

  const refreshOn = (result: ScenarioActionState) => {
    if (result.success) {
      toast.success(result.success)
      setOpen(false)
      router.refresh()
    }
    return result
  }

  const [state, applyAction, applyPending] = useActionState(
    async (prev: ScenarioActionState, formData: FormData) =>
      refreshOn(await setOverride(prev, formData)),
    initialState,
  )

  const [, resetAction, resetPending] = useActionState(
    async (prev: ScenarioActionState, formData: FormData) =>
      refreshOn(await removeOverride(prev, formData)),
    initialState,
  )

  const hidden = (
    <>
      <input type="hidden" name="scenarioId" value={scenarioId} />
      <input type="hidden" name="targetType" value={target.targetType} />
      <input type="hidden" name="targetId" value={target.targetId} />
      <input type="hidden" name="occurrenceKey" value={target.occurrenceKey ?? ''} />
    </>
  )

  if (!open) {
    return (
      <div className="flex shrink-0 items-center gap-1">
        {isAdjusted ? (
          <form action={resetAction}>
            {hidden}
            <button
              type="submit"
              disabled={resetPending}
              aria-label={`Desfazer o ajuste de ${description}`}
              title="Voltar ao valor real"
              className="text-muted-foreground hover:text-foreground flex size-9 items-center justify-center rounded-full disabled:opacity-50"
            >
              <RotateCcw className="size-4" aria-hidden />
            </button>
          </form>
        ) : null}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Ajustar ${description} neste cenário`}
          className="text-muted-foreground hover:text-[var(--brand)] flex size-9 items-center justify-center rounded-full"
        >
          <SlidersHorizontal className="size-4" aria-hidden />
        </button>
      </div>
    )
  }

  return (
    <div className="bg-card border-border mt-2 flex w-full flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Ajustar no cenário</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Fechar"
          className="text-muted-foreground flex size-9 items-center justify-center rounded-full"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      {/* Excluir é um override com `is_included = false`, e não uma remoção:
          o lançamento continua existindo, só não conta neste cenário. */}
      <form action={applyAction}>
        {hidden}
        <input type="hidden" name="isIncluded" value="false" />
        <input type="hidden" name="amountCents" value="" />
        <input type="hidden" name="dateOverride" value="" />
        <Button
          type="submit"
          variant="outline"
          disabled={applyPending}
          className="min-h-11 w-full justify-start"
        >
          Não contar neste cenário
        </Button>
      </form>

      <form action={applyAction} className="flex flex-col gap-3">
        {hidden}
        <input type="hidden" name="isIncluded" value="true" />
        <input type="hidden" name="amountCents" value={cents} />

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`valor-${target.targetId}-${target.occurrenceKey ?? 'all'}`} className="text-muted-foreground text-xs font-medium">
            Outro valor
          </label>
          <input
            id={`valor-${target.targetId}-${target.occurrenceKey ?? 'all'}`}
            type="text"
            inputMode="numeric"
            autoComplete="off"
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
              if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) event.preventDefault()
            }}
            onChange={() => undefined}
            className={cn(
              'tabular border-input bg-card focus-visible:border-primary focus-visible:ring-ring/25',
              'min-h-11 rounded-lg border px-3 text-base font-semibold outline-none focus-visible:ring-2',
            )}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`data-${target.targetId}-${target.occurrenceKey ?? 'all'}`} className="text-xs">
            Outra data
          </Label>
          <Input
            id={`data-${target.targetId}-${target.occurrenceKey ?? 'all'}`}
            name="dateOverride"
            type="date"
            defaultValue={currentDate}
            className="min-h-11 text-base"
          />
        </div>

        {state.error ? <p className="text-[var(--destructive)] text-xs">{state.error}</p> : null}

        <Button type="submit" disabled={applyPending} className="min-h-11">
          {applyPending ? 'Aplicando…' : 'Aplicar ao cenário'}
        </Button>
      </form>

      <p className="text-muted-foreground text-xs">
        Isso vale só dentro deste cenário. Seu lançamento continua como está.
      </p>
    </div>
  )
}
