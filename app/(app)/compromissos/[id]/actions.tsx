'use client'

import { useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  deleteRecurring,
  toggleRecurringActive,
  type RecurringActionState,
} from '@/lib/actions/recurring'
import { Button } from '@/components/ui/button'

const initialState: RecurringActionState = {}

/**
 * Desativar e excluir.
 *
 * Duas ações com consequências diferentes, e a tela diz qual é qual antes:
 * desativar para a regra de gerar ocorrências e mantém tudo; excluir some com a
 * regra, mas **não** com os lançamentos já pagos, que são histórico.
 */
export function RuleActions({
  id,
  isActive,
  materializedCount,
}: {
  id: string
  isActive: boolean
  materializedCount: number
}) {
  const router = useRouter()

  const [toggleState, toggleAction, togglePending] = useActionState(
    async (prev: RecurringActionState, formData: FormData) => {
      const result = await toggleRecurringActive(prev, formData)
      if (result.success) {
        toast.success(result.success)
        router.refresh()
      }
      return result
    },
    initialState,
  )

  const [deleteState, deleteAction, deletePending] = useActionState(
    async (prev: RecurringActionState, formData: FormData) => {
      const result = await deleteRecurring(prev, formData)
      if (result.success) {
        toast.success(result.success)
        router.push('/compromissos')
      }
      return result
    },
    initialState,
  )

  return (
    <section className="border-border flex flex-col gap-4 border-t pt-6">
      <form action={toggleAction} className="flex flex-col gap-2">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="isActive" value={isActive ? 'false' : 'true'} />
        <Button type="submit" variant="outline" disabled={togglePending} className="min-h-12">
          {togglePending ? 'Salvando…' : isActive ? 'Desativar' : 'Reativar'}
        </Button>
        <p className="text-muted-foreground text-xs">
          {isActive
            ? 'Para de aparecer na agenda. O histórico fica, e dá para reativar depois.'
            : 'Volta a gerar ocorrências a partir de hoje.'}
        </p>
        {toggleState.error ? (
          <p className="text-[var(--destructive)] text-xs">{toggleState.error}</p>
        ) : null}
      </form>

      <form
        action={deleteAction}
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          if (!window.confirm('Excluir esta conta fixa? Os lançamentos já pagos continuam no extrato.')) {
            event.preventDefault()
          }
        }}
      >
        <input type="hidden" name="id" value={id} />
        <Button
          type="submit"
          variant="ghost"
          disabled={deletePending}
          className="text-[var(--destructive)] min-h-12"
        >
          {deletePending ? 'Excluindo…' : 'Excluir conta fixa'}
        </Button>
        <p className="text-muted-foreground text-xs">
          {materializedCount === 0
            ? 'Nenhuma ocorrência foi paga ainda.'
            : `${materializedCount} ${
                materializedCount === 1 ? 'ocorrência já paga continua' : 'ocorrências já pagas continuam'
              } no extrato: são histórico, e apagá-las mudaria o saldo de meses fechados.`}
        </p>
        {deleteState.error ? (
          <p className="text-[var(--destructive)] text-xs">{deleteState.error}</p>
        ) : null}
      </form>
    </section>
  )
}
