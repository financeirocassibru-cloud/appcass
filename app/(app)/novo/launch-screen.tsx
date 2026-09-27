'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { ArrowRight, ChevronRight } from 'lucide-react'
import type { Category } from '@/lib/db/queries/categories'
import type { EntryKind } from '@/lib/db/types'
import type { CreditOption } from '@/lib/finance/credit'
import { LaunchForm, type LaunchGoal, type LaunchMode } from '@/components/finance/launch-form'

/**
 * A tela do [+]: o formulário e, embaixo, o que já foi cadastrado do tipo escolhido.
 *
 * v1.0 — 2026-09-27. Os atalhos acompanham Saída/Entrada: em Saída, contas fixas e
 * parcelamentos; em Entrada, renda fixa. É onde essas listas passaram a morar depois de sair
 * da aba Mais.
 *
 * v1.1 — 2026-09-27. "Ver lançamentos" virou "Ver todos", com a seta embaixo do texto em vez
 * do ícone de lista ao lado: o link disputava a largura do título no topo da tela.
 *
 * v1.2 — 2026-09-27. Metas saiu da aba Mais e mora aqui, no rodapé de Saída, como Contas
 * fixas. O formulário recebe as metas (modo Meta) e as sugestões de palavra-chave.
 *
 * v1.3 — 2026-09-27 (Fase 13). "Cartões e empréstimos" nos atalhos dos dois tipos — dinheiro
 * de empréstimo também é entrada —, e as contas vão para o "Pago com" do formulário.
 */
export function LaunchScreen({
  expenseCategories,
  incomeCategories,
  today,
  initialKind,
  initialMode,
  counts,
  goals,
  suggestions,
  creditAccounts,
}: {
  expenseCategories: Category[]
  incomeCategories: Category[]
  today: string
  initialKind: EntryKind
  initialMode: LaunchMode
  counts: {
    fixedExpenses: number
    fixedIncomes: number
    openPlans: number
    activeGoals: number
    creditAccounts: number
  }
  goals: LaunchGoal[]
  suggestions: Record<EntryKind, string[]>
  creditAccounts: CreditOption[]
}) {
  const [kind, setKind] = useState<EntryKind>(initialKind)

  const cards: { href: Route; label: string; note: string } = {
    href: '/cartoes',
    label: 'Cartões e empréstimos',
    note: counts.creditAccounts === 1 ? '1 cadastrado' : `${counts.creditAccounts} cadastrados`,
  }

  type Shortcut = { href: Route; label: string; note: string }
  const byKind: Shortcut[] =
    kind === 'expense'
      ? [
          {
            href: '/compromissos',
            label: 'Contas fixas',
            note: counts.fixedExpenses === 1 ? '1 ativa' : `${counts.fixedExpenses} ativas`,
          },
          {
            href: '/parcelas',
            label: 'Parcelamentos',
            note: counts.openPlans === 1 ? '1 em andamento' : `${counts.openPlans} em andamento`,
          },
          {
            href: '/metas',
            label: 'Metas',
            note: counts.activeGoals === 1 ? '1 em andamento' : `${counts.activeGoals} em andamento`,
          },
        ]
      : [
          {
            href: '/rendas',
            label: 'Renda fixa',
            note: counts.fixedIncomes === 1 ? '1 ativa' : `${counts.fixedIncomes} ativas`,
          },
        ]
  const shortcuts: Shortcut[] = [...byKind, cards]

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Novo lançamento</h1>
        <Link
          href="/novo/lancamentos"
          aria-label="Ver todos os lançamentos"
          className="flex min-h-11 min-w-11 shrink-0 flex-col items-center justify-center text-sm leading-tight font-medium text-[var(--brand)]"
        >
          Ver todos
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>

      <LaunchForm
        expenseCategories={expenseCategories}
        incomeCategories={incomeCategories}
        today={today}
        initialKind={initialKind}
        initialMode={initialMode}
        goals={goals}
        suggestions={suggestions}
        creditAccounts={creditAccounts}
        onKindChange={setKind}
      />

      <section aria-labelledby="titulo-cadastrados" className="flex flex-col gap-2 border-t pt-4">
        <h2 id="titulo-cadastrados" className="text-muted-foreground text-sm font-semibold">
          Cadastrados
        </h2>
        <ul className="divide-border flex flex-col divide-y">
          {shortcuts.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="flex min-h-11 items-center justify-between gap-3 py-3 text-sm font-medium"
              >
                {item.label}
                <span className="text-muted-foreground flex items-center gap-2 text-xs font-normal">
                  {item.note}
                  <ChevronRight className="size-4" aria-hidden />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
