import { createClient } from '@/lib/supabase/server'

/**
 * Identidade do usuário na requisição atual.
 *
 * Resolve o `sub` por `getClaims()`, que confere a assinatura do JWT contra as
 * chaves públicas do projeto — nunca `getSession()`, que aceita o que vier no
 * cookie (invariante 11 do CLAUDE.md).
 *
 * Existe num lugar só porque toda escrita precisa preencher `user_id`: a RLS
 * exige no `with check`, e espalhar essa leitura pelas actions seria repetir a
 * mesma chance de esquecer.
 */
export class NotAuthenticatedError extends Error {
  constructor() {
    super('Usuário não autenticado')
    this.name = 'NotAuthenticatedError'
  }
}

export async function currentUserId(): Promise<string> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const sub = data?.claims?.sub

  if (typeof sub !== 'string' || sub === '') {
    throw new NotAuthenticatedError()
  }
  return sub
}

/** O `sub`, ou `null` quando não há sessão — para quem trata ausência sem erro. */
export async function currentUserIdOrNull(): Promise<string | null> {
  try {
    return await currentUserId()
  } catch {
    return null
  }
}
