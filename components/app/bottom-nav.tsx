'use client'

import type { Route } from 'next'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { House, Plus, ReceiptText, TrendingUp, Ellipsis } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Barra de navegação inferior, conforme `docs/DESIGN.md`.
 *
 * Cinco destinos, com o `[+]` central elevado. Substitui o scroll horizontal de
 * abas do app antigo (`nav-tabs` com `overflow-x: auto`), que em tela pequena
 * escondia opções sem nenhuma indicação de que havia mais.
 */

const TABS = [
  { href: '/', label: 'Início', Icon: House },
  { href: '/lancamentos', label: 'Extrato', Icon: ReceiptText },
  { href: '/projecao', label: 'Projeção', Icon: TrendingUp },
  { href: '/mais', label: 'Mais', Icon: Ellipsis },
] as const

/** `true` se a rota atual pertence a esta aba. */
function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function BottomNav() {
  const pathname = usePathname()

  // As duas primeiras abas ficam à esquerda do [+], as duas últimas à direita.
  const left = TABS.slice(0, 2)
  const right = TABS.slice(2)

  return (
    <nav
      aria-label="Navegação principal"
      // `pb-[env(safe-area-inset-bottom)]`: sem isso a barra fica sob o
      // indicador de gestos no iPhone.
      className="bg-card fixed inset-x-0 bottom-0 z-50 border-t pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-md items-end justify-around px-2">
        {left.map((tab) => (
          <NavItem key={tab.href} {...tab} active={isActive(pathname, tab.href)} />
        ))}

        <li className="flex-1">
          <Link
            href="/novo"
            aria-label="Novo lançamento"
            className="bg-primary text-primary-foreground focus-visible:ring-ring mx-auto -mt-5 flex size-14 items-center justify-center rounded-full shadow-lg transition-transform active:scale-95 focus-visible:ring-2 focus-visible:outline-none"
          >
            <Plus className="size-7" aria-hidden />
          </Link>
        </li>

        {right.map((tab) => (
          <NavItem key={tab.href} {...tab} active={isActive(pathname, tab.href)} />
        ))}
      </ul>
    </nav>
  )
}

function NavItem({
  href,
  label,
  Icon,
  active,
}: {
  href: string
  label: string
  Icon: typeof House
  active: boolean
}) {
  return (
    <li className="flex-1">
      <Link
        href={href as Route}
        aria-current={active ? 'page' : undefined}
        // 44px de altura mínima: alvo de toque de `docs/DESIGN.md`.
        className={cn(
          'flex min-h-11 flex-col items-center gap-0.5 rounded-md px-1 py-2 text-[11px] font-medium transition-colors',
          active ? 'text-primary' : 'text-muted-foreground',
        )}
      >
        <Icon className="size-5" aria-hidden />
        {label}
      </Link>
    </li>
  )
}
