import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { Route } from 'next'

// v1.3 — 27/09/2026: só o nome da tela; o "· Cass" vem do `template` do layout raiz.
export const metadata = { title: 'Mais' }

// v1.1 — 2026-09-26: fase 7, a tela do assistente.
// v1.2 — 2026-09-27: Contas fixas e Parcelas saíram daqui para o [+], junto com Renda fixa.
// v1.3 — 2026-09-27: Metas também — virou Saída › Meta no [+], com a lista no rodapé dele.
// v1.4 — 2026-09-27 (Fase 13): Cartões e empréstimos — também no rodapé do [+].
const ITENS = [
  { href: '/assistente', label: 'Assistente', nota: null },
  { href: '/cartoes', label: 'Cartões e empréstimos', nota: null },
  { href: '/ajustes', label: 'Ajustes', nota: null },
  { href: '/ajustes/categorias', label: 'Categorias', nota: null },
  { href: '/cenarios', label: 'Cenários', nota: null },
] as const

// v1.5 — 28/09/2026: layout de computador — a partir de `lg` (1024 px) a largura vai a `lg:max-w-2xl` (formulário). No celular continua `max-w-md`.
export default function MaisPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8 lg:max-w-2xl lg:px-10 lg:py-10">
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
