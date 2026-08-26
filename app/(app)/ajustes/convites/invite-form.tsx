'use client'

import { useActionState } from 'react'
import { invite } from '@/lib/actions/invites'
import type { ActionState } from '@/lib/actions/auth'
import { FormField, FormMessage, SubmitButton } from '@/components/auth/form-field'

const initialState: ActionState = {}

export function InviteForm() {
  const [state, formAction, pending] = useActionState(invite, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormField label="E-mail do convidado" name="email" type="email" autoComplete="off" />
      <FormMessage error={state.error} success={state.success} />
      <SubmitButton pending={pending}>Enviar convite</SubmitButton>
    </form>
  )
}
