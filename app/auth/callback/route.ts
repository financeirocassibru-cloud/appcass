import { NextResponse, type NextRequest } from 'next/server'
import { safeRedirectPath } from '@/lib/safe-redirect'
import { createClient } from '@/lib/supabase/server'

/**
 * Troca o código do link de e-mail (convite, recuperação de senha) por uma
 * sessão em cookie.
 *
 * O fluxo é PKCE: o link traz um `code` de uso único, e é o servidor que o
 * converte em sessão. O token nunca aparece na URL final.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const proxima = searchParams.get('proxima')

  const destination = safeRedirectPath(proxima)

  if (!code) {
    return NextResponse.redirect(`${origin}/login?erro=link-invalido`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(`${origin}/login?erro=link-expirado`)
  }

  return NextResponse.redirect(`${origin}${destination}`)
}
