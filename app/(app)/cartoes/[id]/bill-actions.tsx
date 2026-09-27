'use client'

import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  archiveCreditAccount,
  carryCreditBill,
  payCreditBill,
  type CreditActionState,
} from '@/lib/actions/credit'
import type { CreditAccount } from '@/lib/finance/credit'
import { formatCents } from '@/lib/finance/money'
import { FormMessage } from '@/components/auth/form-field'
import { CreditAccountForm } from '@/components/finance/credit-account-form'
import { MoneyInput } from '@/components/finance/money-input'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * Pagar e parcelar uma fatura; editar e arquivar a conta — v1.0 — 2026-09-27 (Fase 13).
 *
 * Pagar sugere o restante, e aceita menos: o mínimo, ou o que couber. O que faltar rola para
 * a fatura seguinte quando o vencimento passar (rotativo), a menos que seja parcelado aqui.
 * Pagar mais que o restante é aceito — a diferença são juros e encargos.
 */
export function BillActions({
  accountId,
  dueOn,
  remainingCents,
  today,
  nextDue,
  canCarry,
}: {
  accountId: string
  dueOn: string
  remainingCents: number
  today: string
  nextDue: string
  /** Só a fatura vencida ou a próxima se parcela — a futura ainda nem fechou. */
  canCarry: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState<'pay' | 'carry' | null>(null)
  const [payCents, setPayCents] = useState(remainingCents)
  const [installments, setInstallments] = useState(6)
  const [installmentCents, setInstallmentCents] = useState(0)

  const [payState, payAction, paying] = useActionState(
    async (prev: CreditActionState, formData: FormData) => {
      const result = await payCreditBill(prev, formData)
      if (result.success) {
        toast.success(result.success)
        setOpen(null)
        router.refresh()
      }
      return result
    },
    {},
  )

  const [carryState, carryAction, carrying] = useActionState(
    async (prev: CreditActionState, formData: FormData) => {
      const result = await carryCreditBill(prev, formData)
      if (result.success) {
        toast.success(result.success)
        setOpen(null)
        router.refresh()
      }
      return result
    },
    {},
  )

  const carryTotal = installments * installmentCents

  return (
    <div className="flex flex-col gap-3 border-t pt-3">
      <div className="flex gap-2">
        <Button
          type="button"
          variant={open === 'pay' ? 'default' : 'outline'}
          className="min-h-11 flex-1"
          onClick={() => setOpen(open === 'pay' ? null : 'pay')}
        >
          Pagar
        </Button>
        {canCarry ? (
          <Button
            type="button"
            variant={open === 'carry' ? 'default' : 'outline'}
            className="min-h-11 flex-1"
            onClick={() => setOpen(open === 'carry' ? null : 'carry')}
          >
            Parcelar restante
          </Button>
        ) : null}
      </div>

      {open === 'pay' ? (
        <form action={payAction} className="flex flex-col gap-3">
          <input type="hidden" name="accountId" value={accountId} />
          <input type="hidden" name="dueOn" value={dueOn} />
          <input type="hidden" name="amountCents" value={payCents} />
          <MoneyInput name={null} compact label="Valor pago" initialCents={remainingCents} onCentsChange={setPayCents} />
          <p className="text-muted-foreground text-xs">
            {payCents < remainingCents
              ? `Faltam ${formatCents(remainingCents - payCents)}: vão para a fatura seguinte no vencimento (rotativo), ou parcele o restante.`
              : payCents > remainingCents
                ? `${formatCents(payCents - remainingCents)} a mais entram como juros e encargos.`
                : 'Quita a fatura.'}
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`pago-em-${dueOn}`}>Pago em</Label>
            <Input
              id={`pago-em-${dueOn}`}
              name="paidOn"
              type="date"
              required
              defaultValue={today}
              className="min-h-11 text-base"
            />
          </div>
          <FormMessage error={payState.error} />
          <Button type="submit" disabled={paying || payCents <= 0} className="min-h-11">
            {paying ? 'Salvando…' : 'Registrar pagamento'}
          </Button>
        </form>
      ) : null}

      {open === 'carry' ? (
        <form action={carryAction} className="flex flex-col gap-3">
          <input type="hidden" name="accountId" value={accountId} />
          <input type="hidden" name="dueOn" value={dueOn} />
          <input type="hidden" name="installments" value={installments} />
          <input type="hidden" name="installmentCents" value={installmentCents} />
          <p className="text-muted-foreground text-xs">
            Os <span className="tabular">{formatCents(remainingCents)}</span> restantes viram
            parcelas nas faturas seguintes, a partir da que vence em {nextDue.split('-').reverse().join('/')}.
            Se ainda vai pagar uma entrada, registre o pagamento antes.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`vezes-${dueOn}`}>Em quantas vezes</Label>
            <Input
              id={`vezes-${dueOn}`}
              type="number"
              min={1}
              max={360}
              inputMode="numeric"
              value={installments}
              onChange={(event) => setInstallments(Math.max(1, Math.min(360, Number(event.target.value) || 1)))}
              className="min-h-11 w-28 text-base"
            />
          </div>
          <MoneyInput name={null} compact label="Valor de cada parcela" onCentsChange={setInstallmentCents} />
          {installmentCents > 0 ? (
            <p className="text-muted-foreground text-xs">
              Total <span className="tabular">{formatCents(carryTotal)}</span>
              {carryTotal >= remainingCents
                ? ` · ${formatCents(carryTotal - remainingCents)} de juros`
                : ' · menos que o restante'}
            </p>
          ) : null}
          <FormMessage error={carryState.error} />
          <Button
            type="submit"
            disabled={carrying || installmentCents <= 0 || carryTotal < remainingCents}
            className="min-h-11"
          >
            {carrying ? 'Salvando…' : `Parcelar em ${installments}×`}
          </Button>
        </form>
      ) : null}
    </div>
  )
}

/** Editar a conta e arquivar/desarquivar. */
export function AccountSettings({
  account,
  suggestions,
}: {
  account: CreditAccount
  suggestions: readonly string[]
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [state, archiveAction, archiving] = useActionState(
    async (prev: CreditActionState, formData: FormData) => {
      const result = await archiveCreditAccount(prev, formData)
      if (result.success) {
        toast.success(result.success)
        router.refresh()
      }
      return result
    },
    {},
  )

  return (
    <section className="border-border flex flex-col gap-4 border-t pt-6">
      {editing ? (
        <CreditAccountForm
          account={account}
          suggestions={suggestions}
          onSaved={() => {
            toast.success('Salvo.')
            setEditing(false)
            router.refresh()
          }}
        />
      ) : (
        <Button type="button" variant="outline" className="min-h-11" onClick={() => setEditing(true)}>
          Editar {account.kind === 'card' ? 'cartão' : 'empréstimo'}
        </Button>
      )}

      <form action={archiveAction} className="flex flex-col gap-2">
        <input type="hidden" name="id" value={account.id} />
        <input type="hidden" name="archive" value={account.archivedAt ? 'false' : 'true'} />
        <Button type="submit" variant="ghost" disabled={archiving} className="min-h-11">
          {account.archivedAt ? 'Desarquivar' : 'Arquivar'}
        </Button>
        <p className="text-muted-foreground text-xs">
          Arquivar tira a conta do &ldquo;Pago com&rdquo;. Os lançamentos e as faturas continuam.
        </p>
        <FormMessage error={state.error} />
      </form>
    </section>
  )
}
