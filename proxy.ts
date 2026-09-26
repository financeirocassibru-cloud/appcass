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
    // Tudo, exceto estáticos, imagens e os arquivos do PWA.
    //
    // `sw.js` precisa ficar de fora por um motivo que só aparece rodando: um
    // service worker servido com redirecionamento é **recusado pelo navegador**,
    // e o guarda de rota redireciona tudo que não é público para /login. Com
    // ele dentro do matcher o worker nunca registra, e o app nunca funciona
    // offline — sem erro visível, só sem funcionar.
    //
    // `swe-worker-*.js` é o worker auxiliar que o Serwist gera ao lado.
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|swe-worker-.*\\.js|icons/|~offline|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
