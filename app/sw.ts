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

// ---------------------------------------------------------------------------
// Web Push — v1.1 — 2026-09-26, fase 7.
//
// O trabalho da IA continua depois que o app fecha, e é aqui que o aviso de
// "terminei" chega: sem estes dois ouvintes, a inscrição de push existiria e
// nenhuma notificação apareceria.
//
// Os ouvintes vêm DEPOIS de `serwist.addEventListeners()` de propósito: ele
// registra os dele para fetch/install/activate, e 'push' e 'notificationclick'
// não colidem com nenhum.
// ---------------------------------------------------------------------------

interface PushPayload {
  title: string
  body: string
  url: string
}

const FALLBACK: PushPayload = {
  title: 'Assistente',
  body: 'Seu pedido terminou.',
  url: '/assistente',
}

self.addEventListener('push', (event) => {
  // Sem carga, ou com carga ilegível, ainda mostramos algo: o navegador exige
  // uma notificação visível para cada push recebido (`userVisibleOnly`), e
  // engolir o evento em silêncio faz o navegador revogar a inscrição.
  let payload: PushPayload = FALLBACK
  try {
    const data = event.data?.json() as Partial<PushPayload> | undefined
    if (data?.title && data?.body) {
      payload = { title: data.title, body: data.body, url: data.url ?? FALLBACK.url }
    }
  } catch {
    // Fica o texto padrão.
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      // Uma notificação por vez: o aviso mais novo substitui o anterior em vez
      // de empilhar três "terminei" na bandeja.
      tag: 'assistente',
      data: { url: payload.url },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? FALLBACK.url

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })

      // Reaproveita uma aba aberta em vez de abrir a quinta: quem tocou no aviso
      // quer VER o resultado, não colecionar janelas.
      for (const client of clients) {
        if ('focus' in client) {
          await client.focus()
          if ('navigate' in client) await client.navigate(url)
          return
        }
      }

      await self.clients.openWindow(url)
    })(),
  )
})
