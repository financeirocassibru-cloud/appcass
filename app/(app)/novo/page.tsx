import { listActiveCategories } from '@/lib/db/queries/categories'
import { todayISO } from '@/lib/finance/date'
import { NewEntryForm } from './form'

export const metadata = { title: 'Novo lançamento · Finanças' }
export const dynamic = 'force-dynamic'

export default async function NovoPage() {
  // As duas listas de uma vez: alternar saída/entrada não deve ir ao banco de novo.
  const [expense, income] = await Promise.all([
    listActiveCategories('expense'),
    listActiveCategories('income'),
  ])

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
      <h1 className="text-2xl font-bold tracking-tight">Novo lançamento</h1>
      <NewEntryForm
        expenseCategories={expense}
        incomeCategories={income}
        today={todayISO()}
      />
    </main>
  )
}
