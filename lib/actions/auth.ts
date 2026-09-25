'use server'

import { redirect } from 'next/navigation'
import { hashInviteCode } from '@/lib/invite-code'
import { safeRedirectPath } from '@/lib/safe-redirect'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { firstAccountSchema, loginSchema, redeemSchema } from '@/lib/validation/auth'
import { claimInvite, releaseInvite } from './invites'

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

/** `true` enquanto nenhuma conta existir. Ver `createFirstAccount`. */
export async function isSystemEmpty(): Promise<boolean> {
  const admin = createAdminClient()
  const { count, error } = await admin
    .from('profiles')
    .select('id', { count: 'exact', head: true })

  if (error) return false
  return (count ?? 0) === 0
}

/**
 * Cria a primeira conta do sistema.
 *
 * Existe para resolver o impasse do bootstrap: com o cadastro público desligado
 * e a entrada só por convite, sem esta porta ninguém jamais entraria — não há
 * admin para gerar o primeiro código.
 *
 * A porta fecha sozinha: assim que existe uma conta, `isSystemEmpty()` passa a
 * ser falso e esta action recusa. A checagem é refeita aqui dentro, e não só na
 * tela, porque a tela pode estar em cache.
 *
 * Quem promove a admin é o trigger `handle_new_user`, na mesma transação do
 * insert em `auth.users`. Antes isso era um UPDATE separado daqui, que em
 * produção não teve efeito e deixou o sistema sem nenhum administrador — e sem
 * volta, porque a porta de bootstrap já havia fechado. Ver a migration 0008.
 */
export async function createFirstAccount(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = firstAccountSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  if (!(await isSystemEmpty())) {
    return { error: 'O sistema já tem uma conta. Peça um código de convite ao administrador.' }
  }

  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    // Sem SMTP configurado, não há como confirmar por e-mail. A conta já nasce
    // confirmada porque a entrada é controlada por convite, não por e-mail.
    email_confirm: true,
  })

  if (error || !data.user) {
    return { error: 'Não foi possível criar a conta. Tente novamente.' }
  }

  const supabase = await createClient()
  await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  redirect('/')
}

/**
 * Resgata um convite: valida o código, cria a conta e entra.
 *
 * A ordem importa. O convite é reivindicado ANTES de a conta existir, porque o
 * UPDATE condicional é o que fecha a corrida entre duas pessoas usando o mesmo
 * código. Se a criação da conta falhar em seguida, o convite volta a ficar
 * pendente.
 *
 * Ponto frágil conhecido: entre reivindicar e criar existe uma janela em que
 * uma queda do processo deixaria o convite consumido sem conta criada. A saída
 * é o admin revogar e gerar outro.
 */
export async function redeemInvite(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = redeemSchema.safeParse({
    code: formData.get('code'),
    email: formData.get('email'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  const inviteId = await claimInvite(hashInviteCode(parsed.data.code))
  if (!inviteId) {
    // Mensagem única para inexistente, expirado, revogado e já usado — dizer
    // qual dos quatro ajudaria quem está tentando adivinhar códigos.
    return { error: 'Código inválido ou expirado.' }
  }

  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
  })

  if (error || !data.user) {
    await releaseInvite(inviteId)
    const alreadyExists = error?.message.toLowerCase().includes('already')
    return {
      error: alreadyExists
        ? 'Este e-mail já tem conta. Tente entrar em vez de resgatar o convite.'
        : 'Não foi possível criar a conta. Tente novamente.',
    }
  }

  // Best-effort: a conta já existe e o convite já foi consumido ao ser
  // reivindicado. Falhar aqui só deixa a trilha de auditoria sem o
  // `accepted_by` — não é motivo para recusar um cadastro que deu certo.
  await admin.from('invites').update({ accepted_by: data.user.id }).eq('id', inviteId)

  const supabase = await createClient()
  await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  redirect('/')
}

export async function logout(): Promise<never> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
