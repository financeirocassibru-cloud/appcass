'use client'

import { useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  deleteInstallmentPlan,
  type InstallmentActionState,
} from '@/lib/actions/installments'
import { Button } from '@/components/ui/button'

const initialState: InstallmentActionState = {}

/**
 * Excluir o parcelamento.
 *
 * Não existe "editar": mudar o valor ou o número de parcelas significa refazer
 * o rateio, e o rateio já virou lançamentos — alguns possivelmente pagos.
 * Recalcular por cima disso obrigaria a decidir, parcela a parcela, o que fazer
 * com o que já aconteceu. Excluir e recriar é a operação honesta, e a tela diz
 * isso em vez de oferecer um botão que faria escolhas silenciosas.
 */
export function PlanActions({
  id,
  paidCount,
  pendingCount,
}: {
  id: string
  paidCount: number
  pendingCount: number
}) {
  const router = useRouter()

  const [state, formAction, pending] = useActionState(
    async (prev: InstallmentActionState, formData: FormData) => {
      const result = await deleteInstallmentPlan(prev, formData)
      if (result.success) {
        toast.success(result.success)
        router.push('/parcelas')
      }
      return result
    },
    initialState,
  )

  return (
    <section className="border-border flex flex-col gap-4 border-t pt-6">
      <p className="text-muted-foreground text-xs">
        Para mudar o valor ou o número de parcelas, exclua e crie de novo: o rateio já virou
        lançamentos, e recalcular por cima teria de decidir sozinho o que fazer com as parcelas
        que você já pagou.
      </p>

      <form
        action={formAction}
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          if (!window.confirm('Excluir este parcelamento?')) event.preventDefault()
        }}
      >
        <input type="hidden" name="id" value={id} />
        <Button
          type="submit"
          variant="ghost"
          disabled={pending}
          className="text-[var(--destructive)] min-h-12"
        >
          {pending ? 'Excluindo…' : 'Excluir parcelamento'}
        </Button>
        <p className="text-muted-foreground text-xs">
          {pendingCount > 0
            ? `${pendingCount} ${
                pendingCount === 1 ? 'parcela pendente sai' : 'parcelas pendentes saem'
              } do extrato.`
            : 'Nenhuma parcela pendente.'}
          {paidCount > 0
            ? ` ${paidCount} ${paidCount === 1 ? 'já paga continua' : 'já pagas continuam'}: são histórico, e apagá-las mudaria o saldo de meses fechados.`
            : ''}
        </p>
        {state.error ? (
          <p className="text-[var(--destructive)] text-xs">{state.error}</p>
        ) : null}
      </form>
    </section>
  )
}
