import Link from 'next/link'
import type { Route } from 'next'
import { listActiveCategories } from '@/lib/db/queries/categories'
import { listEntriesByMonth, monthTotals } from '@/lib/db/queries/entries'
import { formatDayLabel, groupByDay } from '@/lib/finance/grouping'
import { monthKey, todayISO } from '@/lib/finance/date'
import type { EntryKind } from '@/lib/db/types'
import { Balance, Money } from '@/components/finance/money'
import { EntryRow } from './entry-row'
import { Filters } from './filters'

export const metadata = { title: 'Extrato · Finanças' }
export const dynamic = 'force-dynamic'

const MONTH_LABEL = new Intl.DateTimeFormat('pt-BR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

function labelForMonth(month: string): string {
  const [year, m] = month.split('-').map(Number) as [number, number]
  return MONTH_LABEL.format(new Date(Date.UTC(year, m - 1, 1)))
}

/** Desloca um `YYYY-MM` em N meses, sem passar por `Date`. */
function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split('-').map(Number) as [number, number]
  const zeroBased = year * 12 + (m - 1) + delta
  const newYear = Math.floor(zeroBased / 12)
  const newMonth = (zeroBased % 12) + 1
  return `${newYear}-${String(newMonth).padStart(2, '0')}`
}

const VALID_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

export default async function LancamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; categoria?: string; tipo?: string; status?: string }>
}) {
  const params = await searchParams
  const today = todayISO()

  // Mês inválido na URL cai no mês corrente em vez de quebrar a tela.
  const month = params.mes && VALID_MONTH.test(params.mes) ? params.mes : monthKey(today)

  const kind: EntryKind | undefined =
    params.tipo === 'expense' || params.tipo === 'income' ? params.tipo : undefined
  const settled =
    params.status === 'pago' ? true : params.status === 'pendente' ? false : undefined

  const [entries, categories] = await Promise.all([
    listEntriesByMonth({ month, categoryId: params.categoria, kind, settled }),
    listActiveCategories(),
  ])

  const totals = monthTotals(entries)
  const groups = groupByDay(entries, (entry) => entry.occurredOn)

  const queryFor = (m: string) => {
    const next = new URLSearchParams()
    next.set('mes', m)
    if (params.categoria) next.set('categoria', params.categoria)
    if (params.tipo) next.set('tipo', params.tipo)
    if (params.status) next.set('status', params.status)
    return `/lancamentos?${next.toString()}` as Route
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-5 px-6 py-8">
      <header className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Extrato</h1>

        <nav className="flex items-center justify-between gap-2" aria-label="Mês">
          <Link
            href={queryFor(shiftMonth(month, -1))}
            aria-label="Mês anterior"
            className="text-muted-foreground hover:text-foreground flex min-h-11 min-w-11 items-center justify-center rounded-md text-xl"
          >
            ‹
          </Link>
          <span className="text-sm font-semibold capitalize">{labelForMonth(month)}</span>
          <Link
            href={queryFor(shiftMonth(month, 1))}
            aria-label="Mês seguinte"
            className="text-muted-foreground hover:text-foreground flex min-h-11 min-w-11 items-center justify-center rounded-md text-xl"
          >
            ›
          </Link>
        </nav>

        <dl className="bg-card grid grid-cols-3 gap-2 rounded-xl border p-4">
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground text-[11px]">Entradas</dt>
            <dd>
              <Money cents={totals.incomeCents} kind="income" withSign={false} className="text-sm" />
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground text-[11px]">Saídas</dt>
            <dd>
              <Money cents={totals.expenseCents} kind="expense" withSign={false} className="text-sm" />
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground text-[11px]">Saldo</dt>
            <dd>
              <Balance cents={totals.netCents} className="text-sm" />
            </dd>
          </div>
        </dl>

        <Filters categories={categories} month={month} />
      </header>

      {groups.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          Nenhum lançamento neste mês com os filtros atuais.
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((group) => (
            <section key={group.date} className="flex flex-col gap-1">
              <h2 className="text-muted-foreground px-1 text-xs font-semibold uppercase">
                {formatDayLabel(group.date, today)}
              </h2>
              <ul className="divide-border bg-card divide-y rounded-xl border">
                {group.items.map((entry) => (
                  <EntryRow key={entry.id} entry={entry} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  )
}
