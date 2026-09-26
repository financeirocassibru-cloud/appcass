'use client'

import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createGoal, updateGoal, type GoalActionState } from '@/lib/actions/goals'
import type { GoalProgress } from '@/lib/db/queries/goals'
import { MoneyInput } from '@/components/finance/money-input'
import { formatCents, popCentsDigit, pushCentsDigit } from '@/lib/finance/money'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FormMessage } from '@/components/auth/form-field'
import { cn } from '@/lib/utils'

const initialState: GoalActionState = {}

/**
 * Formulário de meta.
 *
 * O aporte mensal é opcional de propósito: deixando vazio, o app divide o que
 * falta pelos meses até o prazo. Preenchendo, o valor manda — e o prazo passa a
 * ser uma consequência, não uma promessa.
 */
export function GoalForm({ today, goal }: { today: string; goal?: GoalProgress }) {
  const router = useRouter()
  const isEditing = goal !== undefined
  const [monthlyCents, setMonthlyCents] = useState(goal?.monthlyContributionCents ?? 0)

  const [state, formAction, pending] = useActionState(
    async (prev: GoalActionState, formData: FormData) => {
      const result = isEditing ? await updateGoal(prev, formData) : await createGoal(prev, formData)
      if (result.success) {
        toast.success(result.success)
        router.push('/metas')
      }
      return result
    },
    initialState,
  )

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {isEditing ? <input type="hidden" name="id" value={goal.id} /> : null}
      <input type="hidden" name="monthlyContributionCents" value={monthlyCents} />

      <MoneyInput
        name="targetAmountCents"
        label="Quanto quer juntar"
        initialCents={goal?.targetAmountCents}
        autoFocus={!isEditing}
      />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="campo-nome">Para quê</Label>
        <Input
          id="campo-nome"
          name="name"
          required
          maxLength={60}
          defaultValue={goal?.name}
          placeholder="Viagem"
          className="min-h-11 text-base"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="campo-prazo">Até quando (opcional)</Label>
        <Input
          id="campo-prazo"
          name="targetDate"
          type="date"
          min={today}
          defaultValue={goal?.targetDate ?? ''}
          className="min-h-11 text-base"
        />
        <p className="text-muted-foreground text-xs">
          Com prazo, o app calcula sozinho quanto guardar por mês.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="campo-aporte" className="text-muted-foreground text-sm font-medium">
          Ou defina o aporte mensal
        </label>
        <input
          id="campo-aporte"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={formatCents(monthlyCents)}
          onKeyDown={(event) => {
            if (event.key === 'Backspace') {
              event.preventDefault()
              setMonthlyCents(popCentsDigit)
              return
            }
            if (/^[0-9]$/.test(event.key)) {
              event.preventDefault()
              setMonthlyCents((current) => pushCentsDigit(current, event.key))
              return
            }
            if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) event.preventDefault()
          }}
          onChange={() => undefined}
          className={cn(
            'tabular border-input bg-card focus-visible:border-primary focus-visible:ring-ring/25',
            'min-h-11 rounded-lg border px-3 text-base font-semibold outline-none focus-visible:ring-2',
            monthlyCents === 0 && 'text-muted-foreground',
          )}
        />
        <p className="text-muted-foreground text-xs">
          {monthlyCents === 0
            ? 'Deixe zerado para o app calcular a partir do prazo.'
            : 'Este valor manda; o prazo vira consequência.'}
        </p>
      </div>

      <FormMessage error={state.error} />

      <Button type="submit" disabled={pending} className="min-h-12 text-base">
        {pending ? 'Salvando…' : isEditing ? 'Salvar alterações' : 'Criar meta'}
      </Button>
    </form>
  )
}
