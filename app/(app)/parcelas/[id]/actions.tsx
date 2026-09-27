'use client'

import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  deleteInstallmentPlan,
  setInstallmentsPaid,
  type InstallmentActionState,
} from '@/lib/actions/installments'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const initialState: InstallmentActionState = {}

/**
 * Excluir o parcelamento.
 *
 * Não existe "editar": mudar o valor ou o número de parcelas significa refazer
 * o rateio, e o rateio já virou lançamentos — alguns possivelmente pagos.
 * Recalcular por cima disso obrigaria a decidir, parcela a parcela, o que fazer
 * com o que já aconteceu. Excluir e recriar é a operação honesta, e a tela diz
 * isso em vez de oferecer um botão que faria escolhas silenciosas.
 *
 * v1.1 — 2026-09-27: `PaidCountForm`, abaixo, para declarar quantas já foram pagas.
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

/**
 * "Quantas já foram pagas?" — para o parcelamento que entrou no app já em andamento.
 *
 * v1.0 — 2026-09-27. A declaração é o estado inteiro, não um acréscimo: 1..N ficam pagas, as
 * seguintes voltam a pendentes. Quem pagou marcando uma a uma no Histórico mantém a data em
 * que marcou; as que viram pagas por aqui ficam com a data de vencimento, que é quando o
 * dinheiro saiu. O `confirm` diz isso antes, porque desmarcar uma paga muda o saldo.
 */
export function PaidCountForm({
  id,
  paidCount,
  installmentsCount,
}: {
  id: string
  paidCount: number
  installmentsCount: number
}) {
  const router = useRouter()
  const [value, setValue] = useState(paidCount)

  const [state, formAction, pending] = useActionState(
    async (prev: InstallmentActionState, formData: FormData) => {
      const result = await setInstallmentsPaid(prev, formData)
      if (result.success) {
        toast.success(result.success)
        router.refresh()
      }
      return result
    },
    initialState,
  )

  const valid = Number.isInteger(value) && value >= 0 && value <= installmentsCount

  return (
    <form
      action={formAction}
      className="flex flex-col gap-2 rounded-xl bg-[var(--surface)] p-4"
      onSubmit={(event) => {
        const message =
          value === 0
            ? 'Todas as parcelas voltam a pendentes. Continuar?'
            : `As parcelas 1 a ${value} ficam pagas, cada uma na data dela${
                value < installmentsCount ? `; da ${value + 1} em diante, pendentes` : ''
              }. Continuar?`
        if (!window.confirm(message)) event.preventDefault()
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Label htmlFor="campo-pagas">Quantas já foram pagas?</Label>
      <div className="flex gap-2">
        <Input
          id="campo-pagas"
          name="paidCount"
          type="number"
          min={0}
          max={installmentsCount}
          inputMode="numeric"
          value={Number.isNaN(value) ? '' : value}
          onChange={(event) => setValue(event.target.valueAsNumber)}
          className="min-h-11 w-24 text-base"
        />
        <Button
          type="submit"
          variant="outline"
          disabled={pending || !valid || value === paidCount}
          className="min-h-11 flex-1"
        >
          {pending ? 'Atualizando…' : 'Atualizar'}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        Para um parcelamento que você cadastrou já em andamento. As pagas entram na data de
        vencimento de cada uma, e a agenda para de cobrá-las.
      </p>
      {state.error ? <p className="text-[var(--destructive)] text-xs">{state.error}</p> : null}
    </form>
  )
}
