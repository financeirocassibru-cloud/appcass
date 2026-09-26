'use client'

import { SerwistProvider } from '@serwist/next/react'

/**
 * Registro do service worker.
 *
 * No modo configurador do Serwist — o que funciona com o Turbopack do Next 16 —
 * o registro não é injetado automaticamente, então mora aqui.
 *
 * `cacheOnNavigation` é o que entrega a promessa da fase 6: cada tela visitada
 * fica guardada, e é por isso que o app abre sem rede depois do primeiro uso.
 *
 * Desligado em desenvolvimento: um worker servindo página do cache enquanto se
 * edita código é a receita de "mudei e não mudou nada".
 */
export function ServiceWorker({ children }: { children: React.ReactNode }) {
  return (
    <SerwistProvider
      swUrl="/sw.js"
      cacheOnNavigation
      disable={process.env.NODE_ENV === 'development'}
    >
      {children}
    </SerwistProvider>
  )
}
