'use client'

import { useActionState } from 'react'
import { login, type ActionState } from '@/lib/actions/auth'
import { FormField, FormMessage, SubmitButton } from '@/components/auth/form-field'

const initialState: ActionState = {}

export function LoginForm({ proxima }: { proxima?: string }) {
  const [state, formAction, pending] = useActionState(login, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {proxima ? <input type="hidden" name="proxima" value={proxima} /> : null}
      <FormField label="E-mail" name="email" type="email" autoComplete="email" />
      <FormField label="Senha" name="password" type="password" autoComplete="current-password" />
      <FormMessage error={state.error} />
      <SubmitButton pending={pending}>Entrar</SubmitButton>
    </form>
  )
}
