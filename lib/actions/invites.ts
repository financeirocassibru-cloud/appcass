'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { inviteSchema } from '@/lib/validation/auth'
import type { ActionState } from './auth'

/**
 * Convida alguém por e-mail.
 *
 * O cadastro público fica desligado no painel do Supabase — esta é a única
 * porta de entrada. A chave de serviço entra aqui e em nenhum outro lugar:
 * ela ignora a RLS, então o `is_admin()` abaixo é verificado ANTES, com o
 * cliente normal, onde a RLS ainda vale.
 */
export async function invite(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = inviteSchema.safeParse({ email: formData.get('email') })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'E-mail inválido' }
  }

  const supabase = await createClient()

  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) {
    return { error: 'Sessão expirada. Entre novamente.' }
  }

  const { data: isAdmin } = await supabase.rpc('is_admin')
  if (!isAdmin) {
    return { error: 'Apenas administradores podem convidar.' }
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const admin = createAdminClient()

  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(parsed.data.email, {
    redirectTo: `${siteUrl}/auth/callback?proxima=/definir-senha`,
  })

  if (inviteError) {
    return { error: `Não foi possível enviar o convite: ${inviteError.message}` }
  }

  // Trilha de auditoria. Gravada com o cliente normal, sob RLS — a policy exige
  // que `invited_by` seja o próprio usuário.
  const { error: auditError } = await supabase
    .from('invites')
    .insert({ email: parsed.data.email, invited_by: userId })

  if (auditError && auditError.code !== '23505') {
    return { error: `Convite enviado, mas o registro falhou: ${auditError.message}` }
  }

  revalidatePath('/ajustes/convites')
  return { success: `Convite enviado para ${parsed.data.email}.` }
}
