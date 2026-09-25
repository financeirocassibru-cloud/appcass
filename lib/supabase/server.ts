import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/lib/db/types'
import { supabasePublishableKey, supabaseUrl } from './env'

/**
 * Cliente para Server Components, Server Actions e Route Handlers.
 *
 * `cookies()` é assíncrono no Next 16 — o acesso síncrono da fase de
 * compatibilidade do 15 foi removido.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Chamado de dentro de um Server Component, onde escrever cookie não
          // é permitido. Pode ser ignorado: o proxy renova a sessão a cada
          // requisição.
        }
      },
    },
  })
}
