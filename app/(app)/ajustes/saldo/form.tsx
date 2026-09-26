'use client'

import { useActionState, useState } from 'react'
import { toast } from 'sonner'
import { updateBalanceAnchor, type ProfileActionState } from '@/lib/actions/profile'
import { MoneyInput } from '@/components/finance/money-input'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FormMessage } from '@/components/auth/form-field'
import { cn } from '@/lib/utils'

const initialState: ProfileActionState = {}

/**
 * Âncora do saldo: valor + data.
 *
 * O sinal fica num botão separado porque `MoneyInput` só aceita dígitos — e o
 * sinal precisa existir: quem está no vermelho tem saldo negativo, e um campo
 * que só aceita positivo obrigaria a mentir.
 */
export function BalanceAnchorForm({
  initialCents,
  initialIsNegative,
  initialDate,
  today,
}: {
  initialCents: number
  initialIsNegative: boolean
  initialDate: string
  today: string
}) {
  const [isNegative, setIsNegative] = useState(initialIsNegative)

  const [state, formAction, pending] = useActionState(
    async (prev: ProfileActionState, formData: FormData) => {
      const result = await updateBalanceAnchor(prev, formData)
      if (result.success) toast.success(result.success)
      return result
    },
    initialState,
  )

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="isNegative" value={isNegative ? 'true' : 'false'} />

      <div role="radiogroup" aria-label="Sinal do saldo" className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1">
        {[false, true].map((negative) => (
          <button
            key={negative ? 'negativo' : 'positivo'}
            type="button"
            role="radio"
            aria-checked={isNegative === negative}
            onClick={() => setIsNegative(negative)}
            className={cn(
              'min-h-11 rounded-md text-sm font-semibold transition-colors',
              isNegative === negative
                ? negative
                  ? 'bg-card text-[var(--expense)] shadow-sm'
                  : 'bg-card text-[var(--income)] shadow-sm'
                : 'text-muted-foreground',
            )}
          >
            {negative ? 'Negativo' : 'Positivo'}
          </button>
        ))}
      </div>

      <MoneyInput
        name="openingBalanceCents"
        label="Quanto você tem"
        initialCents={initialCents}
        autoFocus
      />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="campo-saldo-data">Nesta data</Label>
        <Input
          id="campo-saldo-data"
          name="openingBalanceOn"
          type="date"
          required
          max={today}
          defaultValue={initialDate}
          className="min-h-11 text-base"
        />
        <p className="text-muted-foreground text-xs">
          Lançamentos anteriores a essa data não entram na conta — já estão dentro do valor
          informado.
        </p>
      </div>

      <FormMessage error={state.error} />

      <Button type="submit" disabled={pending} className="min-h-12 text-base">
        {pending ? 'Salvando…' : 'Salvar saldo'}
      </Button>
    </form>
  )
}
