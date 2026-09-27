import { listActiveCategories } from '@/lib/db/queries/categories'
import { listImportedDescriptions } from '@/lib/db/queries/entries'
import { listGoals } from '@/lib/db/queries/goals'
import { listInstallmentPlans } from '@/lib/db/queries/installments'
import { listRecurringRules } from '@/lib/db/queries/recurring'
import { todayISO } from '@/lib/finance/date'
import type { LaunchMode } from '@/components/finance/launch-form'
import { LaunchScreen } from './launch-screen'

/**
 * O [+]. v1.2 — 2026-09-27.
 *
 * v1.2: Saída › Meta (`?modo=meta`) registra aporte ou cria meta, e as metas ativas vêm junto;
 * as descrições já importadas alimentam as sugestões de palavra-chave.
 *
 * v1.1: conta fixa, renda fixa e parcelamento passaram a nascer aqui, e não na aba Mais. A URL
 * pré-seleciona o modo (`?tipo=entrada&modo=fixa`, `?modo=parcelado`) — é para onde apontam os
 * botões "Nova" das listas. Abaixo do formulário, os atalhos para o que já foi cadastrado e
 * para "Ver lançamentos".
 */

export const metadata = { title: 'Novo lançamento · Finanças' }
export const dynamic = 'force-dynamic'

const MODES: Record<string, LaunchMode> = {
  avulso: 'single',
  fixa: 'recurring',
  parcelado: 'installment',
  meta: 'goal',
}

export default async function NovoPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; modo?: string }>
}) {
  const params = await searchParams

  // As duas listas de uma vez: alternar saída/entrada não deve ir ao banco de novo.
  const [expense, income, rules, plans, goals, imported] = await Promise.all([
    listActiveCategories('expense'),
    listActiveCategories('income'),
    listRecurringRules(),
    listInstallmentPlans(),
    listGoals(false),
    listImportedDescriptions(),
  ])

  const counts = {
    fixedExpenses: rules.filter((rule) => rule.isActive && rule.kind === 'expense').length,
    fixedIncomes: rules.filter((rule) => rule.isActive && rule.kind === 'income').length,
    openPlans: plans.filter((plan) => plan.paidCount < plan.installmentsCount).length,
    activeGoals: goals.filter((goal) => goal.remainingCents > 0).length,
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
      <LaunchScreen
        expenseCategories={expense}
        incomeCategories={income}
        today={todayISO()}
        initialKind={params.tipo === 'entrada' ? 'income' : 'expense'}
        initialMode={MODES[params.modo ?? ''] ?? 'single'}
        counts={counts}
        goals={goals.map((goal) => ({
          id: goal.id,
          name: goal.name,
          savedCents: goal.savedCents,
          targetAmountCents: goal.targetAmountCents,
        }))}
        suggestions={imported}
      />
    </main>
  )
}
