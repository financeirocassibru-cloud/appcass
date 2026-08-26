'use client'

import { useActionState } from 'react'
import { createFirstAccount, redeemInvite, type ActionState } from '@/lib/actions/auth'
import { FormField, FormMessage, SubmitButton } from '@/components/auth/form-field'

const initialState: ActionState = {}

export function RedeemForm() {
  const [state, formAction, pending] = useActionState(redeemInvite, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormField
        label="Código de convite"
        name="code"
        autoComplete="off"
        placeholder="ABCDE-FGHJK-MNPQR-TUVWX-Y3467"
        // Maiúsculas e monoespaçado: o código é lido de uma mensagem e conferido
        // caractere a caractere.
        className="font-mono uppercase tracking-wider"
      />
      <FormField label="E-mail" name="email" type="email" autoComplete="email" />
      <FormField label="Senha" name="password" type="password" autoComplete="new-password" />
      <FormField
        label="Confirme a senha"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
      />
      <FormMessage error={state.error} />
      <SubmitButton pending={pending}>Criar conta</SubmitButton>
    </form>
  )
}

export function FirstAccountForm() {
  const [state, formAction, pending] = useActionState(createFirstAccount, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormField label="E-mail" name="email" type="email" autoComplete="email" />
      <FormField label="Senha" name="password" type="password" autoComplete="new-password" />
      <FormField
        label="Confirme a senha"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
      />
      <FormMessage error={state.error} />
      <SubmitButton pending={pending}>Criar conta de administrador</SubmitButton>
    </form>
  )
}
