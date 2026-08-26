'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Route } from 'next'

const BASE_TABS = [
  { href: '/ajustes', label: 'Perfil' },
  { href: '/ajustes/categorias', label: 'Categorias' },
] as const

export function AjustesTabs({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname()
  const tabs = isAdmin
    ? [...BASE_TABS, { href: '/ajustes/convites', label: 'Convites' } as const]
    : BASE_TABS

  return (
    <nav aria-label="Seções dos ajustes">
      <ul className="flex gap-1 overflow-x-auto rounded-lg bg-[var(--surface)] p-1">
        {tabs.map((tab) => {
          const active = pathname === tab.href
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href as Route}
                aria-current={active ? 'page' : undefined}
                className={`block min-h-11 whitespace-nowrap rounded-md px-3 py-2.5 text-center text-sm font-medium transition-colors ${
                  active
                    ? 'bg-[var(--surface-raised)] text-[var(--brand)] shadow-sm'
                    : 'text-[var(--foreground-muted)]'
                }`}
              >
                {tab.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
