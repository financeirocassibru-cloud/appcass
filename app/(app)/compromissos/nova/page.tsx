import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { listActiveCategories } from '@/lib/db/queries/categories'
import { todayISO } from '@/lib/finance/date'
import { RecurringForm } from '../form'

export const metadata = { title: 'Nova conta fixa · Finanças' }
export const dynamic = 'force-dynamic'

export default async function NovaContaFixaPage() {
  const [expenseCategories, incomeCategories] = await Promise.all([
    listActiveCategories('expense'),
    listActiveCategories('income'),
  ])

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
        <h1 className="text-2xl font-bold tracking-tight">Nova conta fixa</h1>
      </div>

      <RecurringForm
        expenseCategories={expenseCategories}
        incomeCategories={incomeCategories}
        today={todayISO()}
      />
    </main>
  )
}
