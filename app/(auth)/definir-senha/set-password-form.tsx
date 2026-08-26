'use client'

import { useActionState } from 'react'
import { setPassword, type ActionState } from '@/lib/actions/auth'
import { FormField, FormMessage, SubmitButton } from '@/components/auth/form-field'

const initialState: ActionState = {}

export function SetPasswordForm() {
  const [state, formAction, pending] = useActionState(setPassword, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormField label="Nova senha" name="password" type="password" autoComplete="new-password" />
      <FormField
        label="Confirme a senha"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
      />
      <FormMessage error={state.error} />
      <SubmitButton pending={pending}>Salvar senha</SubmitButton>
    </form>
  )
}
