import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { todayISO } from '@/lib/finance/date'
import { GoalForm } from '../form'

export const metadata = { title: 'Nova meta · Finanças' }
export const dynamic = 'force-dynamic'

export default function NovaMetaPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
      <div className="flex flex-col gap-2">
        <Link href="/metas" className="text-muted-foreground flex min-h-11 items-center gap-1 text-sm">
          <ChevronLeft className="size-4" aria-hidden />
          Metas
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Nova meta</h1>
      </div>

      <GoalForm today={todayISO()} />
    </main>
  )
}
