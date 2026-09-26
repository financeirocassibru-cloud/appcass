import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { listActiveCategories } from '@/lib/db/queries/categories'
import { todayISO } from '@/lib/finance/date'
import { NewInstallmentForm } from './form'

export const metadata = { title: 'Novo parcelamento · Finanças' }
export const dynamic = 'force-dynamic'

export default async function NovaParcelaPage() {
  // Parcelamento é sempre saída: uma compra parcelada é dívida, não receita.
  const categories = await listActiveCategories('expense')

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
      <div className="flex flex-col gap-2">
        <Link
          href="/parcelas"
          className="text-muted-foreground flex min-h-11 items-center gap-1 text-sm"
        >
          <ChevronLeft className="size-4" aria-hidden />
          Parcelas
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Novo parcelamento</h1>
      </div>

      <NewInstallmentForm categories={categories} today={todayISO()} />
    </main>
  )
}
