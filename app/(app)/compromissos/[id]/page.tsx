import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { listActiveCategories } from '@/lib/db/queries/categories'
import { countMaterialized, getRecurringRule } from '@/lib/db/queries/recurring'
import { todayISO } from '@/lib/finance/date'
import { RecurringForm } from '../form'
import { RuleActions } from './actions'

export const metadata = { title: 'Conta fixa · Finanças' }
export const dynamic = 'force-dynamic'

export default async function ContaFixaPage({
  params,
}: {
  // Next 16: `params` é assíncrono (invariante 12).
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const [rule, expenseCategories, incomeCategories] = await Promise.all([
    getRecurringRule(id),
    listActiveCategories('expense'),
    listActiveCategories('income'),
  ])

  if (!rule) notFound()

  const materializedCount = await countMaterialized(rule.id)

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
      <div className="flex flex-col gap-2">
        <Link
          href="/compromissos"
          className="text-muted-foreground flex min-h-11 items-center gap-1 text-sm"
        >
          <ChevronLeft className="size-4" aria-hidden />
          Contas fixas
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Editar conta fixa</h1>
      </div>

      <RecurringForm
        expenseCategories={expenseCategories}
        incomeCategories={incomeCategories}
        today={todayISO()}
        rule={rule}
      />

      <RuleActions
        id={rule.id}
        isActive={rule.isActive}
        materializedCount={materializedCount}
      />
    </main>
  )
}
