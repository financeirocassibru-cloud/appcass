import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { Route } from 'next'

export const metadata = { title: 'Mais · Finanças' }

// v1.1 — 2026-09-26: fase 7, a tela do assistente.
const ITENS = [
  { href: '/assistente', label: 'Assistente', nota: null },
  { href: '/ajustes', label: 'Ajustes', nota: null },
  { href: '/ajustes/categorias', label: 'Categorias', nota: null },
  { href: '/compromissos', label: 'Contas fixas', nota: null },
  { href: '/parcelas', label: 'Parcelas', nota: null },
  { href: '/cenarios', label: 'Cenários', nota: null },
  { href: '/metas', label: 'Metas', nota: null },
] as const

export default function MaisPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
      <h1 className="text-2xl font-bold tracking-tight">Mais</h1>
      <ul className="divide-border flex flex-col divide-y">
        {ITENS.map((item) => (
          <li key={item.href}>
            {item.nota ? (
              <div className="flex min-h-11 items-center justify-between gap-3 py-3">
                <span className="text-muted-foreground text-sm">{item.label}</span>
                <span className="text-muted-foreground bg-muted rounded-full px-2 py-0.5 text-xs">
                  {item.nota}
                </span>
              </div>
            ) : (
              <Link
                href={item.href as Route}
                className="flex min-h-11 items-center justify-between gap-3 py-3 text-sm font-medium"
              >
                {item.label}
                <ChevronRight className="text-muted-foreground size-4" aria-hidden />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </main>
  )
}
