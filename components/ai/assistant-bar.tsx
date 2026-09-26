'use client'

import { usePathname } from 'next/navigation'
import { AssistantComposer } from './composer'

/**
 * A caixa do assistente, ancorada acima da barra inferior. v1.0 — 2026-09-26.
 *
 * É o que faz a caixa existir em **qualquer** tela. Some em `/` e em
 * `/assistente` porque nessas duas a versão grande já está na página, e duas
 * caixas pedindo a mesma coisa na mesma tela dariam a impressão de que fazem
 * coisas diferentes.
 *
 * Cliente por causa do `usePathname`, e só por isso — o que ela renderiza é o
 * mesmo componente das outras duas superfícies.
 */
export function AssistantBar() {
  const pathname = usePathname()
  if (pathname === '/' || pathname === '/assistente') return null

  return <AssistantComposer variant="bar" />
}
