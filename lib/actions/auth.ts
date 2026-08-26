'use server'

import { redirect } from 'next/navigation'
import { safeRedirectPath } from '@/lib/safe-redirect'
import { createClient } from '@/lib/supabase/server'
import { loginSchema, setPasswordSchema } from '@/lib/validation/auth'

export interface ActionState {
  error?: string
  success?: string
}

/**
 * Login por e-mail e senha.
 *
 * Não existe caminho equivalente ao `verificarUsuarioExiste` do app antigo, que
 * autenticava só com o e-mail. A verificação da senha é do Supabase Auth.
 */
export async function login(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)

  if (error) {
    // Mensagem genérica de propósito: dizer "e-mail não cadastrado" revelaria
    // quais e-mails existem na base.
    return { error: 'E-mail ou senha incorretos' }
  }

  redirect(safeRedirectPath(formData.get('proxima')))
}

/** Define a senha do convidado, ou troca a senha de quem já está logado. */
export async function setPassword(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = setPasswordSchema.safeParse({
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  const supabase = await createClient()

  // O link do convite já criou a sessão; sem ela não há o que atualizar.
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims) {
    return { error: 'Link expirado. Peça um novo convite.' }
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) {
    return { error: 'Não foi possível definir a senha. Tente novamente.' }
  }

  redirect('/')
}

export async function logout(): Promise<never> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
