import { defaultCache } from '@serwist/next/worker'
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { NetworkOnly, Serwist } from 'serwist'

/**
 * Service worker do app.
 *
 * O objetivo da fase 6 é modesto e explícito: **o app abre e dá para ler sem
 * rede depois do primeiro carregamento**. Não é um app offline-first — escrever
 * sem rede exigiria fila de sincronização e resolução de conflito, e um app de
 * dinheiro que sincroniza errado é pior que um que avisa "sem conexão".
 *
 * Duas decisões de privacidade, que num app de finanças não são detalhe:
 *
 * 1. **Nada de `/auth`, `/login` e `/entrar` no cache.** São respostas que
 *    carregam ou trocam sessão; guardá-las convida a servir uma sessão velha.
 * 2. **O logout limpa os caches.** As páginas guardadas mostram saldo e
 *    lançamentos; sem a limpeza, quem usasse o mesmo aparelho depois veria os
 *    números da pessoa anterior a partir do cache, mesmo já deslogado. Quem
 *    apaga é a própria página, em `app/(app)/ajustes/logout-button.tsx` — a
 *    API `caches` está disponível ali também, e um canal de mensagem com o
 *    worker seria uma peça a mais para fazer o mesmo.
 */

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

/** Rotas que nunca entram em cache. */
const NEVER_CACHE = /^\/(auth|login|entrar)(\/|$)/

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && NEVER_CACHE.test(url.pathname),
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: '/~offline',
        matcher: ({ request }) => request.destination === 'document',
      },
    ],
  },
})

serwist.addEventListeners()
