'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { expiryFromNow, generateInviteCode, hashInviteCode } from '@/lib/invite-code'
import { createInviteSchema, revokeInviteSchema } from '@/lib/validation/auth'
import type { ActionState } from './auth'

/** O código em claro só existe aqui, na resposta. Depois disso, só o hash. */
export interface CreateInviteState extends ActionState {
  code?: string
  expiresAt?: string
}

/**
 * Confirma que quem chama é admin, usando o cliente normal — onde a RLS vale.
 * Devolve o id do usuário, ou `null` se não for admin.
 *
 * Sempre chame isto ANTES de usar o cliente admin: a chave de serviço ignora a
 * RLS, então a verificação precisa acontecer do lado onde ela ainda protege.
 */
async function requireAdmin(): Promise<string | null> {
  const supabase = await createClient()

  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (typeof userId !== 'string') return null

  const { data: isAdmin } = await supabase.rpc('is_admin')
  return isAdmin === true ? userId : null
}

/** Gera um convite e devolve o código uma única vez. */
export async function createInvite(
  _prev: CreateInviteState,
  formData: FormData,
): Promise<CreateInviteState> {
  const parsed = createInviteSchema.safeParse({
    label: formData.get('label'),
    expiryDays: formData.get('expiryDays'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  const adminId = await requireAdmin()
  if (!adminId) {
    return { error: 'Apenas administradores podem gerar convites.' }
  }

  const code = generateInviteCode()
  const expiresAt = expiryFromNow(parsed.data.expiryDays)

  const supabase = await createClient()
  const { error } = await supabase.from('invites').insert({
    code_hash: hashInviteCode(code),
    label: parsed.data.label ?? null,
    invited_by: adminId,
    expires_at: expiresAt.toISOString(),
  })

  if (error) {
    return { error: `Não foi possível gerar o convite: ${error.message}` }
  }

  revalidatePath('/ajustes/convites')
  return {
    success: 'Convite gerado. Copie o código agora — ele não será exibido de novo.',
    code,
    expiresAt: expiresAt.toISOString(),
  }
}

/** Revoga um convite que ainda não foi usado. */
export async function revokeInvite(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = revokeInviteSchema.safeParse({ id: formData.get('id') })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Convite inválido' }
  }

  const adminId = await requireAdmin()
  if (!adminId) {
    return { error: 'Apenas administradores podem revogar convites.' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('invites')
    .update({ status: 'revoked' })
    .eq('id', parsed.data.id)
    .eq('status', 'pending')

  if (error) {
    return { error: `Não foi possível revogar: ${error.message}` }
  }

  revalidatePath('/ajustes/convites')
  return { success: 'Convite revogado.' }
}

/**
 * Reivindica um convite pelo código.
 *
 * Roda com a chave de serviço porque quem resgata ainda não tem sessão — e as
 * policies de `invites` são restritas a admin, justamente para que anônimo
 * nunca consiga enumerar convites.
 *
 * O UPDATE condicional é o que garante uso único: se duas pessoas tentarem o
 * mesmo código ao mesmo tempo, só uma recebe a linha de volta.
 */
export async function claimInvite(codeHash: string): Promise<string | null> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('invites')
    .update({ status: 'accepted', accepted_at: new Date().toISOString() })
    .eq('code_hash', codeHash)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .select('id')
    .maybeSingle()

  if (error || !data) return null
  return data.id
}

/** Desfaz a reivindicação quando a criação da conta falha logo depois. */
export async function releaseInvite(inviteId: string): Promise<void> {
  const admin = createAdminClient()
  await admin
    .from('invites')
    .update({ status: 'pending', accepted_at: null })
    .eq('id', inviteId)
}
