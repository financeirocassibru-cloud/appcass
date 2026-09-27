import { listActiveCategories } from '@/lib/db/queries/categories'
import { listInstallmentPlans } from '@/lib/db/queries/installments'
import { listRecurringRules } from '@/lib/db/queries/recurring'
import { todayISO } from '@/lib/finance/date'
import type { LaunchMode } from '@/components/finance/launch-form'
import { LaunchScreen } from './launch-screen'

/**
 * O [+]. v1.1 — 2026-09-27.
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
}

export default async function NovoPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; modo?: string }>
}) {
  const params = await searchParams

  // As duas listas de uma vez: alternar saída/entrada não deve ir ao banco de novo.
  const [expense, income, rules, plans] = await Promise.all([
    listActiveCategories('expense'),
    listActiveCategories('income'),
    listRecurringRules(),
    listInstallmentPlans(),
  ])

  const counts = {
    fixedExpenses: rules.filter((rule) => rule.isActive && rule.kind === 'expense').length,
    fixedIncomes: rules.filter((rule) => rule.isActive && rule.kind === 'income').length,
    openPlans: plans.filter((plan) => plan.paidCount < plan.installmentsCount).length,
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
      />
    </main>
  )
}
