import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { getGoal, listContributions } from '@/lib/db/queries/goals'
import { monthlyContributionCents } from '@/lib/finance/goals'
import { formatCents } from '@/lib/finance/money'
import { todayISO } from '@/lib/finance/date'
import { GoalForm } from '../form'
import { ContributionsPanel } from './contributions'
import { GoalActions } from './actions'

export const metadata = { title: 'Meta · Finanças' }
export const dynamic = 'force-dynamic'

export default async function MetaPage({
  params,
}: {
  // Next 16: `params` é assíncrono (invariante 12).
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const today = todayISO()

  const [goal, contributions] = await Promise.all([getGoal(id), listContributions(id)])
  if (!goal) notFound()

  const monthly = monthlyContributionCents(goal, today)
  const done = goal.remainingCents === 0

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
      <div className="flex flex-col gap-2">
        <Link href="/metas" className="text-muted-foreground flex min-h-11 items-center gap-1 text-sm">
          <ChevronLeft className="size-4" aria-hidden />
          Metas
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{goal.name}</h1>
      </div>

      <section className="flex flex-col gap-3 rounded-2xl bg-[var(--surface)] p-5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="tabular text-2xl font-bold">{formatCents(goal.savedCents)}</p>
          <p className="text-sm text-[var(--foreground-muted)]">
            de <span className="tabular">{formatCents(goal.targetAmountCents)}</span>
          </p>
        </div>

        <div
          role="progressbar"
          aria-valuenow={Math.round(goal.pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${Math.round(goal.pct)}% concluída`}
          className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-raised)]"
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.min(goal.pct, 100)}%`,
              backgroundColor: done ? 'var(--chart-income)' : 'var(--chart-magnitude)',
            }}
          />
        </div>

        <dl className="grid grid-cols-2 gap-3 pt-1">
          <div>
            <dt className="text-xs text-[var(--foreground-muted)]">Falta</dt>
            <dd className="tabular text-sm font-semibold">{formatCents(goal.remainingCents)}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--foreground-muted)]">Por mês</dt>
            <dd className="tabular text-sm font-semibold">
              {done ? '—' : monthly > 0 ? formatCents(monthly) : 'defina um prazo'}
            </dd>
          </div>
        </dl>

        {done ? (
          <p className="text-sm font-medium text-[var(--income)]">Meta alcançada.</p>
        ) : goal.targetDate ? (
          <p className="text-xs text-[var(--foreground-muted)]">
            Prazo: {formatDate(goal.targetDate)}
          </p>
        ) : null}
      </section>

      <ContributionsPanel goalId={goal.id} contributions={contributions} today={today} />

      <details className="flex flex-col gap-3">
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-[var(--brand)]">
          Editar a meta
        </summary>
        <div className="pt-2">
          <GoalForm today={today} goal={goal} />
        </div>
      </details>

      <GoalActions
        id={goal.id}
        isArchived={goal.archivedAt !== null}
        contributionCount={contributions.length}
      />
    </main>
  )
}

/** `dd/mm/aaaa` sem passar por `Date` no fuso local. */
function formatDate(date: string): string {
  const [year, month, day] = date.split('-')
  return `${day}/${month}/${year}`
}
