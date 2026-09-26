'use client'

import { useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { archiveGoal, deleteGoal, type GoalActionState } from '@/lib/actions/goals'
import { Button } from '@/components/ui/button'

const initialState: GoalActionState = {}

/**
 * Arquivar e excluir.
 *
 * Arquivar tira a meta da projeção e da lista e mantém o histórico de aportes.
 * Excluir leva os aportes junto, por cascade — e a tela diz quantos são antes
 * de perguntar.
 */
export function GoalActions({
  id,
  isArchived,
  contributionCount,
}: {
  id: string
  isArchived: boolean
  contributionCount: number
}) {
  const router = useRouter()

  const [archiveState, archiveAction, archivePending] = useActionState(
    async (prev: GoalActionState, formData: FormData) => {
      const result = await archiveGoal(prev, formData)
      if (result.success) {
        toast.success(result.success)
        router.refresh()
      }
      return result
    },
    initialState,
  )

  const [deleteState, deleteAction, deletePending] = useActionState(
    async (prev: GoalActionState, formData: FormData) => {
      const result = await deleteGoal(prev, formData)
      if (result.success) {
        toast.success(result.success)
        router.push('/metas')
      }
      return result
    },
    initialState,
  )

  return (
    <section className="border-border flex flex-col gap-4 border-t pt-6">
      <form action={archiveAction} className="flex flex-col gap-2">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="archive" value={isArchived ? 'false' : 'true'} />
        <Button type="submit" variant="outline" disabled={archivePending} className="min-h-12">
          {archivePending ? 'Salvando…' : isArchived ? 'Restaurar meta' : 'Arquivar meta'}
        </Button>
        <p className="text-muted-foreground text-xs">
          {isArchived
            ? 'Volta para a lista e para a projeção.'
            : 'Sai da lista e da projeção. Os aportes continuam registrados.'}
        </p>
        {archiveState.error ? (
          <p className="text-[var(--destructive)] text-xs">{archiveState.error}</p>
        ) : null}
      </form>

      <form
        action={deleteAction}
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          if (
            !window.confirm(
              contributionCount === 0
                ? 'Excluir esta meta?'
                : `Excluir esta meta e os ${contributionCount} registros de aporte?`,
            )
          ) {
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
          {deletePending ? 'Excluindo…' : 'Excluir meta'}
        </Button>
        <p className="text-muted-foreground text-xs">
          {contributionCount === 0
            ? 'Nenhum aporte registrado.'
            : `Os ${contributionCount} ${
                contributionCount === 1 ? 'registro de aporte sai' : 'registros de aporte saem'
              } junto. Para manter o histórico, arquive em vez de excluir.`}
        </p>
        {deleteState.error ? (
          <p className="text-[var(--destructive)] text-xs">{deleteState.error}</p>
        ) : null}
      </form>
    </section>
  )
}
