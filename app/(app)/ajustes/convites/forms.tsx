'use client'

import { useActionState, useState } from 'react'
import { createInvite, revokeInvite, type CreateInviteState } from '@/lib/actions/invites'
import type { ActionState } from '@/lib/actions/auth'
import { FormField, FormMessage, SubmitButton } from '@/components/auth/form-field'
import { DEFAULT_EXPIRY_DAYS, MAX_EXPIRY_DAYS } from '@/lib/invite-code'

const initialCreate: CreateInviteState = {}
const initialRevoke: ActionState = {}

export function CreateInviteForm() {
  const [state, formAction, pending] = useActionState(createInvite, initialCreate)

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-4">
        <FormField
          label="Para quem é"
          name="label"
          required={false}
          autoComplete="off"
          placeholder="Ana"
          hint="Opcional. Só para você lembrar de quem é o convite."
        />
        <FormField
          label="Validade"
          name="expiryDays"
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_EXPIRY_DAYS}
          defaultValue={DEFAULT_EXPIRY_DAYS}
          hint={`Em dias, de 1 a ${MAX_EXPIRY_DAYS}. Depois disso o código para de funcionar.`}
        />
        <FormMessage error={state.error} />
        <SubmitButton pending={pending}>Gerar código</SubmitButton>
      </form>

      {state.code ? <GeneratedCode code={state.code} /> : null}
    </div>
  )
}

/**
 * O código aparece uma única vez.
 *
 * O banco guarda só o sha256, então nem o servidor consegue mostrá-lo de novo.
 * Se o admin perder, revoga e gera outro.
 */
function GeneratedCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Área de transferência bloqueada (contexto inseguro, permissão negada).
      // O código continua selecionável na tela.
      setCopied(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[var(--brand)] bg-[var(--surface)] p-4">
      <p className="text-sm font-medium">Copie agora — não será exibido de novo.</p>
      <code className="select-all break-all font-mono text-lg tracking-wider">{code}</code>
      <button
        type="button"
        onClick={copy}
        className="min-h-11 rounded-lg bg-[var(--brand)] px-4 text-base font-semibold text-[var(--brand-foreground)]"
      >
        {copied ? 'Copiado' : 'Copiar código'}
      </button>
    </div>
  )
}

export function RevokeInviteButton({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState(revokeInvite, initialRevoke)

  return (
    <form action={formAction} className="shrink-0">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        title={state.error ?? undefined}
        className="min-h-11 rounded-lg px-3 text-sm font-medium text-[var(--expense)] disabled:opacity-60"
      >
        {pending ? '…' : 'Revogar'}
      </button>
    </form>
  )
}
