'use client'

import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createEntry, type EntryActionState } from '@/lib/actions/entries'
import type { Category } from '@/lib/db/queries/categories'
import type { EntryKind } from '@/lib/db/types'
import { MoneyInput } from '@/components/finance/money-input'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FormMessage } from '@/components/auth/form-field'
import { cn } from '@/lib/utils'

const initialState: EntryActionState = {}

/**
 * Lançamento rápido.
 *
 * A meta de `docs/DESIGN.md` é salvar em dois toques: o valor já vem com foco, e
 * descrição e categoria são opcionais. Quem quiser detalhar, detalha; quem só
 * quer registrar R$ 32,00 de mercado, registra.
 */
export function NewEntryForm({
  expenseCategories,
  incomeCategories,
  today,
}: {
  expenseCategories: Category[]
  incomeCategories: Category[]
  today: string
}) {
  const router = useRouter()
  const [kind, setKind] = useState<EntryKind>('expense')
  const [categoryId, setCategoryId] = useState<string>('')

  const [state, formAction, pending] = useActionState(
    async (prev: EntryActionState, formData: FormData) => {
      const result = await createEntry(prev, formData)
      if (result.success) {
        toast.success(result.success)
        router.push('/lancamentos')
      }
      return result
    },
    initialState,
  )

  const categories = kind === 'expense' ? expenseCategories : incomeCategories

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="categoryId" value={categoryId} />

      {/* Saída/entrada primeiro: define o significado de tudo abaixo. */}
      <div role="radiogroup" aria-label="Tipo" className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1">
        {(['expense', 'income'] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={kind === option}
            onClick={() => {
              setKind(option)
              // A categoria escolhida pertence ao tipo anterior; limpar evita
              // enviar uma categoria de despesa num lançamento de receita.
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
            {option === 'expense' ? 'Saída' : 'Entrada'}
          </button>
        ))}
      </div>

      <MoneyInput label="Valor" autoFocus />

      {categories.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span className="text-muted-foreground text-sm font-medium">Categoria</span>
          {/* Chips em rolagem horizontal: em celular é mais rápido que um select. */}
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

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="campo-descricao">Descrição</Label>
        <Input
          id="campo-descricao"
          name="description"
          required
          maxLength={120}
          placeholder={kind === 'expense' ? 'Mercado' : 'Salário'}
          className="min-h-11 text-base"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="campo-data">Data</Label>
        <Input
          id="campo-data"
          name="occurredOn"
          type="date"
          required
          defaultValue={today}
          className="min-h-11 text-base"
        />
      </div>

      <label className="flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          name="isSettled"
          defaultChecked
          className="accent-primary size-5"
        />
        <span className="text-sm">
          {kind === 'expense' ? 'Já paguei' : 'Já recebi'}
        </span>
      </label>

      <FormMessage error={state.error} />

      <Button type="submit" disabled={pending} className="min-h-12 text-base">
        {pending ? 'Salvando…' : 'Salvar'}
      </Button>
    </form>
  )
}
