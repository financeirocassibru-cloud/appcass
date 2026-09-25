import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/lib/db/types'
import { supabasePublishableKey, supabaseUrl } from './env'

/** Rotas alcançáveis sem sessão. */
const PUBLIC_PREFIXES = ['/login', '/entrar', '/auth']

/**
 * Renova a sessão do Supabase a cada requisição e barra quem não está
 * autenticado.
 *
 * Duas regras que, se quebradas, causam logout aleatório e são difíceis de
 * diagnosticar depois:
 *
 *  1. Não insira código entre `createServerClient` e `getClaims()`.
 *  2. Devolva `supabaseResponse` como está. Se precisar de outra resposta,
 *     copie os cookies dela antes.
 *
 * A validação é `getClaims()`, que confere a assinatura do JWT contra as
 * chaves públicas do projeto. `getSession()` não revalida o token e aceita o
 * que vier no cookie — nunca use para proteger rota.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient<Database>(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value)
        }
        supabaseResponse = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, options)
        }
        for (const [key, value] of Object.entries(headers)) {
          supabaseResponse.headers.set(key, value)
        }
      },
    },
  })

  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims

  const { pathname } = request.nextUrl
  const isPublic = PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )

  if (!claims && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('proxima', pathname)
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
