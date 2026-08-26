import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

/**
 * No Next 16 o arquivo `middleware.ts` foi renomeado para `proxy.ts` e a
 * função exportada passou de `middleware` para `proxy`. O runtime é `nodejs`
 * e não é configurável.
 */
export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    // Tudo, exceto estáticos e imagens — não faz sentido renovar sessão neles.
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
