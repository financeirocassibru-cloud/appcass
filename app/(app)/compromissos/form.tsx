'use client'

import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  createRecurring,
  updateRecurring,
  type RecurringActionState,
} from '@/lib/actions/recurring'
import type { Category } from '@/lib/db/queries/categories'
import type { EntryKind } from '@/lib/db/types'
import type { RecurrenceFrequency, RecurringRule } from '@/lib/finance/types'
import { MoneyInput } from '@/components/finance/money-input'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FormMessage } from '@/components/auth/form-field'
import { cn } from '@/lib/utils'

const initialState: RecurringActionState = {}

const FREQUENCIES: { value: RecurrenceFrequency; label: string }[] = [
  { value: 'monthly', label: 'Mensal' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'yearly', label: 'Anual' },
]

/**
 * Formulário de conta fixa, para criar e para editar.
 *
 * O dia do vencimento só aparece quando a frequência é mensal — numa semanal ou
 * anual o vencimento sai da data de início, e um campo que não governa nada só
 * confunde. A validação no servidor recusa a combinação de qualquer forma.
 */
export function RecurringForm({
  expenseCategories,
  incomeCategories,
  today,
  rule,
}: {
  expenseCategories: Category[]
  incomeCategories: Category[]
  today: string
  /** Ausente ao criar. */
  rule?: RecurringRule
}) {
  const router = useRouter()
  const isEditing = rule !== undefined

  const [kind, setKind] = useState<EntryKind>(rule?.kind ?? 'expense')
  const [categoryId, setCategoryId] = useState<string>(rule?.categoryId ?? '')
  const [frequency, setFrequency] = useState<RecurrenceFrequency>(rule?.frequency ?? 'monthly')

  const [state, formAction, pending] = useActionState(
    async (prev: RecurringActionState, formData: FormData) => {
      const result = isEditing
        ? await updateRecurring(prev, formData)
        : await createRecurring(prev, formData)
      if (result.success) {
        toast.success(result.success)
        router.push('/compromissos')
      }
      return result
    },
    initialState,
  )

  const categories = kind === 'expense' ? expenseCategories : incomeCategories

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {isEditing ? <input type="hidden" name="id" value={rule.id} /> : null}
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="categoryId" value={categoryId} />
      <input type="hidden" name="frequency" value={frequency} />

      <div
        role="radiogroup"
        aria-label="Tipo"
        className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1"
      >
        {(['expense', 'income'] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={kind === option}
            onClick={() => {
              setKind(option)
              setCategoryId('')
            }}
            className={cn(
              'min-h-11 rounded-md text-sm font-semibold transition-colors',
              kind === option
                ? option === 'expense'
                  ? 'bg-card text-[var(--expense)] shadow-sm'
                  : 'bg-card text-[var(--income)] shadow-sm'
                : 'text-muted-foreground',
            )}
          >
            {option === 'expense' ? 'Conta a pagar' : 'Renda fixa'}
          </button>
        ))}
      </div>

      <MoneyInput
        label="Valor de cada ocorrência"
        initialCents={rule?.amountCents}
        autoFocus={!isEditing}
      />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="campo-descricao">Descrição</Label>
        <Input
          id="campo-descricao"
          name="description"
          required
          maxLength={120}
          defaultValue={rule?.description}
          placeholder={kind === 'expense' ? 'Aluguel' : 'Salário'}
          className="min-h-11 text-base"
        />
      </div>

      {categories.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span className="text-muted-foreground text-sm font-medium">Categoria</span>
          <div className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-1">
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                aria-pressed={categoryId === category.id}
                onClick={() => setCategoryId(categoryId === category.id ? '' : category.id)}
                className={cn(
                  'min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors',
                  categoryId === category.id
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-input bg-card text-foreground',
                )}
              >
                {category.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-sm font-medium">Repete</span>
        <div role="radiogroup" aria-label="Frequência" className="bg-muted grid grid-cols-3 gap-1 rounded-lg p-1">
          {FREQUENCIES.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={frequency === option.value}
              onClick={() => setFrequency(option.value)}
              className={cn(
                'min-h-11 rounded-md text-sm font-semibold transition-colors',
                frequency === option.value
                  ? 'bg-card text-[var(--brand)] shadow-sm'
                  : 'text-muted-foreground',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {frequency === 'monthly' ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="campo-dia">Dia do vencimento</Label>
          <Input
            id="campo-dia"
            name="dayOfMonth"
            type="number"
            min={1}
            max={31}
            inputMode="numeric"
            defaultValue={rule?.dayOfMonth ?? ''}
            placeholder="10"
            className="min-h-11 text-base"
          />
          <p className="text-muted-foreground text-xs">
            Dia 31 cai no dia 28 em fevereiro — a conta nunca some do mês.
          </p>
        </div>
      ) : (
        // O campo precisa existir no FormData mesmo oculto: o schema espera a
        // chave, e ausência viraria `undefined` em vez de "sem dia".
        <input type="hidden" name="dayOfMonth" value="" />
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="campo-inicio">Começa em</Label>
        <Input
          id="campo-inicio"
          name="startsOn"
          type="date"
          required
          defaultValue={rule?.startsOn ?? today}
          className="min-h-11 text-base"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="campo-fim">Termina em (opcional)</Label>
        <Input
          id="campo-fim"
          name="endsOn"
          type="date"
          defaultValue={rule?.endsOn ?? ''}
          className="min-h-11 text-base"
        />
        <p className="text-muted-foreground text-xs">
          Deixe vazio para uma conta sem prazo de fim.
        </p>
      </div>

      {isEditing ? (
        <p className="text-muted-foreground bg-muted rounded-lg p-3 text-xs">
          Mudar o valor vale da próxima ocorrência em diante. O que você já marcou como pago fica
          como está — é histórico, e mexer nele mudaria o saldo de meses fechados.
        </p>
      ) : null}

      <FormMessage error={state.error} />

      <Button type="submit" disabled={pending} className="min-h-12 text-base">
        {pending ? 'Salvando…' : isEditing ? 'Salvar alterações' : 'Criar conta fixa'}
      </Button>
    </form>
  )
}
