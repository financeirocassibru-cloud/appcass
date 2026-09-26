'use client'

import { createContext, useContext } from 'react'

/**
 * Onde os portais do Radix devem renderizar.
 *
 * v1.0 — 2026-09-26: nasce com a tela cheia do gráfico da Análise.
 *
 * `Dialog.Portal` e `Sheet.Portal` renderizam em `document.body`. Dentro de um elemento em
 * fullscreen nativo isso é **fora da subárvore exibida**, e o navegador não desenha nada: a
 * pessoa toca em "editar" e não acontece nada, sem erro no console. Este contexto deixa quem
 * abriu a tela cheia dizer "portais vão para dentro daqui".
 *
 * O padrão é `undefined`, que é como o Radix entende "use o `body`" — então nada muda em nenhuma
 * tela que não declare um container.
 */
const PortalContainerContext = createContext<HTMLElement | null>(null)

export function PortalContainerProvider({
  container,
  children,
}: {
  container: HTMLElement | null
  children: React.ReactNode
}) {
  return (
    <PortalContainerContext.Provider value={container}>{children}</PortalContainerContext.Provider>
  )
}

export function usePortalContainer(): HTMLElement | undefined {
  return useContext(PortalContainerContext) ?? undefined
}
