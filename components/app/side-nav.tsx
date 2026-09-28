'use client'

import type { Route } from 'next'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  CalendarClock,
  CreditCard,
  HandCoins,
  House,
  Layers,
  ListOrdered,
  MessageCircle,
  Plus,
  ReceiptText,
  Settings,
  Split,
  Tags,
  Target,
  TrendingUp,
} from 'lucide-react'
import { AssistantComposer } from '@/components/ai/composer'
import { Logo } from '@/components/app/logo'
import { cn } from '@/lib/utils'
import { activeHref } from './nav-items'

/**
 * Barra lateral — a navegação do computador. v1.0 — 28/09/2026.
 *
 * Só existe a partir de `lg` (1024 px): abaixo disso ela é `hidden` e quem navega é a barra
 * inferior, que continua exatamente como era. No computador a barra inferior some.
 *
 * Com espaço de sobra, o que no celular fica atrás de "Mais" e no rodapé do [+] vira item
 * direto: são dois cliques a menos, e a tela larga deixa de parecer um celular esticado. O [+]
 * vira o botão "Novo lançamento" no topo, e a caixa do assistente, que no celular flutua acima da
 * barra inferior, mora logo abaixo dele.
 *
 * O assistente usa um balão de conversa, e não estrela ou faísca — a mesma regra "sem ícone de
 * IA" de `components/ai/composer.tsx`.
 */

type Item = { href: string; label: string; Icon: typeof House }

const GROUPS: { title: string | null; items: Item[] }[] = [
  {
    title: null,
    items: [
      { href: '/', label: 'Início', Icon: House },
      { href: '/historico', label: 'Histórico', Icon: ReceiptText },
      { href: '/analise', label: 'Análise', Icon: TrendingUp },
      { href: '/novo/lancamentos', label: 'Todos os lançamentos', Icon: ListOrdered },
    ],
  },
  {
    title: 'Cadastrados',
    items: [
      { href: '/compromissos', label: 'Contas fixas', Icon: CalendarClock },
      { href: '/parcelas', label: 'Parcelamentos', Icon: Layers },
      { href: '/metas', label: 'Metas', Icon: Target },
      { href: '/rendas', label: 'Renda fixa', Icon: HandCoins },
      { href: '/cartoes', label: 'Cartões e empréstimos', Icon: CreditCard },
    ],
  },
  {
    title: 'Planejar',
    items: [
      { href: '/cenarios', label: 'Cenários', Icon: Split },
      { href: '/assistente', label: 'Assistente', Icon: MessageCircle },
    ],
  },
  {
    title: 'Conta',
    items: [
      { href: '/ajustes', label: 'Ajustes', Icon: Settings },
      { href: '/ajustes/categorias', label: 'Categorias', Icon: Tags },
    ],
  },
]

const ALL_HREFS = GROUPS.flatMap((group) => group.items.map((item) => item.href))

export function SideNav() {
  const pathname = usePathname()
  const current = activeHref(pathname, ALL_HREFS)
  // A mesma regra de `AssistantBar`: em `/` e `/assistente` a versão grande já está na página.
  const showAssistant = pathname !== '/' && pathname !== '/assistente'

  return (
    <aside
      aria-label="Navegação principal"
      className="bg-card fixed inset-y-0 left-0 z-40 hidden w-64 flex-col gap-6 overflow-y-auto border-r px-4 py-6 lg:flex"
    >
      <Link href="/" aria-label="Início" className="px-2">
        {/* `target`: no computador o logo do Início fica oculto e o voo da abertura termina
            aqui. O script escolhe o primeiro destino VISÍVEL, então no celular nada muda. */}
        <Logo target />
      </Link>

      <div className="flex flex-col gap-3">
        <Link
          href="/novo"
          className="bg-primary text-primary-foreground focus-visible:ring-ring flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold shadow-sm transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:outline-none"
        >
          <Plus className="size-5" aria-hidden />
          Novo lançamento
        </Link>
        {showAssistant && <AssistantComposer variant="sidebar" />}
      </div>

      <nav className="flex flex-col gap-5">
        {GROUPS.map((group) => (
          <div key={group.title ?? 'principal'} className="flex flex-col gap-1">
            {group.title ? (
              <p className="text-muted-foreground px-3 pb-1 text-[11px] font-semibold tracking-wide uppercase">
                {group.title}
              </p>
            ) : null}
            <ul className="flex flex-col gap-0.5">
              {group.items.map(({ href, label, Icon }) => {
                const active = current === href
                return (
                  <li key={href}>
                    <Link
                      href={href as Route}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
                        active
                          ? // Tom da marca misturado ao fundo: funciona nos dois temas sem `dark:`,
                          // que ignoraria o `data-theme` escolhido pela pessoa.
                          'text-primary bg-[color-mix(in_srgb,var(--brand)_12%,transparent)]'
                          : 'text-muted-foreground hover:text-foreground hover:bg-[var(--surface)]',
                      )}
                    >
                      <Icon className="size-4 shrink-0" aria-hidden />
                      {label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  )
}
