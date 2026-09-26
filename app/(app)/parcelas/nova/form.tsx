'use client'

import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  createInstallmentPlan,
  type InstallmentActionState,
} from '@/lib/actions/installments'
import type { Category } from '@/lib/db/queries/categories'
import { planInstallments } from '@/lib/finance/installments'
import { isISODate } from '@/lib/finance/date'
import { formatCents, popCentsDigit, pushCentsDigit } from '@/lib/finance/money'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FormMessage } from '@/components/auth/form-field'
import { cn } from '@/lib/utils'

const initialState: InstallmentActionState = {}

const ATALHOS = [2, 3, 6, 10, 12]

/**
 * Criação de parcelamento, com prévia do rateio.
 *
 * A prévia usa `planInstallments()` — a mesma função que a Server Action chama
 * para valer. Não é uma estimativa: é o resultado, mostrado antes de gravar.
 *
 * É aí que a exatidão em centavos fica visível. R$ 100,00 em 3x aparece como
 * 33,34 + 33,33 + 33,33, e a linha do total prova que fecha. O app antigo
 * mostrava 33,33 três vezes e perdia um centavo sem avisar.
 */
export function NewInstallmentForm({
  categories,
  today,
}: {
  categories: Category[]
  today: string
}) {
  const router = useRouter()
  const [cents, setCents] = useState(0)
  const [count, setCount] = useState(3)
  const [firstDueOn, setFirstDueOn] = useState(today)
  const [categoryId, setCategoryId] = useState('')

  const [state, formAction, pending] = useActionState(
    async (prev: InstallmentActionState, formData: FormData) => {
      const result = await createInstallmentPlan(prev, formData)
      if (result.success) {
        toast.success(result.success)
        router.push('/parcelas')
      }
      return result
    },
    initialState,
  )

  // A prévia só existe quando há valor, quantidade e data válidos; fora disso
  // não há o que mostrar, e inventar um rateio de zero confundiria.
  const preview =
    cents > 0 && count >= 2 && isISODate(firstDueOn)
      ? planInstallments({
          id: 'previa',
          description: 'x',
          categoryId: null,
          totalAmountCents: cents,
          installmentsCount: count,
          firstDueOn,
        })
      : []

  const previewTotal = preview.reduce((total, parcel) => total + parcel.amountCents, 0)

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="totalAmountCents" value={cents} />
      <input type="hidden" name="installmentsCount" value={count} />
      <input type="hidden" name="categoryId" value={categoryId} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="campo-total" className="text-muted-foreground text-sm font-medium">
          Valor total da compra
        </label>
        <input
          id="campo-total"
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
            if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) event.preventDefault()
          }}
          onChange={() => undefined}
          className={cn(
            'tabular border-input bg-card focus-visible:border-primary focus-visible:ring-ring/25',
            'min-h-16 rounded-xl border px-4 text-3xl font-bold outline-none focus-visible:ring-2',
            cents === 0 && 'text-muted-foreground',
          )}
        />
        <p className="text-muted-foreground text-xs">
          O valor cheio, não o da parcela. Digite os centavos — 1234 vira R$ 12,34.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-sm font-medium">Em quantas vezes</span>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {ATALHOS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={count === option}
              onClick={() => setCount(option)}
              className={cn(
                'min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors',
                count === option
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-input bg-card text-foreground',
              )}
            >
              {option}x
            </button>
          ))}
          <Input
            type="number"
            min={2}
            max={360}
            inputMode="numeric"
            aria-label="Outro número de parcelas"
            value={count}
            onChange={(event) => setCount(Number(event.target.value))}
            className="min-h-11 w-24 shrink-0 text-base"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="campo-descricao">Descrição</Label>
        <Input
          id="campo-descricao"
          name="description"
          required
          maxLength={100}
          placeholder="Sofá"
          className="min-h-11 text-base"
        />
        <p className="text-muted-foreground text-xs">
          Cada parcela entra no extrato como &ldquo;Sofá (1/{count})&rdquo;.
        </p>
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

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="campo-primeira">Primeira parcela vence em</Label>
        <Input
          id="campo-primeira"
          name="firstDueOn"
          type="date"
          required
          value={firstDueOn}
          onChange={(event) => setFirstDueOn(event.target.value)}
          className="min-h-11 text-base"
        />
        <p className="text-muted-foreground text-xs">
          As seguintes caem no mesmo dia dos meses seguintes. Dia 31 vira 28 em fevereiro.
        </p>
      </div>

      {preview.length > 0 ? (
        <section className="flex flex-col gap-2 rounded-xl bg-[var(--surface)] p-4">
          <h2 className="text-sm font-semibold">Como vai ficar</h2>
          <ul className="divide-border flex max-h-64 flex-col divide-y overflow-y-auto">
            {preview.map((parcel) => (
              <li
                key={parcel.occurrenceKey}
                className="flex items-center justify-between gap-3 py-1.5 text-sm"
              >
                <span className="text-muted-foreground">
                  {parcel.installmentNumber}/{parcel.installmentTotal} ·{' '}
                  {formatDueDate(parcel.dueOn)}
                </span>
                <span className="tabular font-medium">{formatCents(parcel.amountCents)}</span>
              </li>
            ))}
          </ul>
          {/* A linha que prova o rateio: a soma das parcelas é o total, centavo
              a centavo. Se um dia não for, aparece aqui antes de gravar — e o
              banco recusa de qualquer forma. */}
          <p className="border-border flex items-center justify-between gap-3 border-t pt-2 text-sm font-semibold">
            <span>Soma das parcelas</span>
            <span className="tabular">{formatCents(previewTotal)}</span>
          </p>
        </section>
      ) : null}

      <FormMessage error={state.error} />

      <Button
        type="submit"
        disabled={pending || cents === 0}
        className="min-h-12 text-base"
      >
        {pending ? 'Criando…' : `Criar parcelamento em ${count}x`}
      </Button>
    </form>
  )
}

/** `dd/mm/aa` sem passar por `Date` no fuso local. */
function formatDueDate(date: string): string {
  const [year, month, day] = date.split('-')
  return `${day}/${month}/${year?.slice(2)}`
}
