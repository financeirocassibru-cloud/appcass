import Link from 'next/link'
import { Plus } from 'lucide-react'
import { getCurrentBalance } from '@/lib/db/queries/balance'
import { getAgendaItems } from '@/lib/db/queries/agenda'
import { getCategoryBreakdown, getMonthlySeries, MONTHS_IN_CHART } from '@/lib/db/queries/summary'
import { DEFAULT_HORIZON_DAYS, splitAgenda } from '@/lib/finance/agenda'
import { todayISO } from '@/lib/finance/date'
import { BalanceHero } from '@/components/finance/balance-hero'
import { Upcoming } from '@/components/finance/upcoming'
import { CategoryRanking } from '@/components/finance/charts/category-ranking'
import { MonthlyBars } from '@/components/finance/charts/monthly-bars'

export const metadata = { title: 'Início · Finanças' }

/**
 * `force-dynamic` porque tudo nesta tela depende de "hoje" e do banco.
 * Prerenderizada, ela congelaria o dia do build — e o saldo junto.
 */
export const dynamic = 'force-dynamic'

export default async function InicioPage() {
  // Uma única leitura do relógio para toda a página: duas chamadas a `todayISO()`
  // na mesma renderização podem cair em dias diferentes na virada da meia-noite,
  // e aí o saldo e a agenda falariam de dias distintos.
  const today = todayISO()

  const [balance, agendaItems, breakdown, monthly] = await Promise.all([
    getCurrentBalance(today),
    // Junta pendentes reais e ocorrências de contas fixas ainda não
    // materializadas, já deduplicadas entre si.
    getAgendaItems(today, DEFAULT_HORIZON_DAYS),
    getCategoryBreakdown(today),
    getMonthlySeries(today, MONTHS_IN_CHART),
  ])

  const agenda = splitAgenda(agendaItems, today, DEFAULT_HORIZON_DAYS)

  const isFirstUse =
    balance.countedEntries === 0 &&
    agendaItems.length === 0 &&
    breakdown.slices.length === 0 &&
    !balance.isAnchorConfigured

  return (
    <main className="mx-auto flex max-w-md flex-col gap-8 px-6 py-8">
      <BalanceHero
        cents={balance.currentCents}
        anchorOn={balance.openingBalanceOn}
        isAnchorConfigured={balance.isAnchorConfigured}
        incomeCents={balance.settledIncomeCents}
        expenseCents={balance.settledExpenseCents}
      />

      {/* Conta nova: em vez de três blocos vazios, um caminho. É o primeiro estado
          que a pessoa vê, e ele tem de dizer o que fazer. */}
      {isFirstUse ? (
        <section className="flex flex-col gap-4 rounded-xl bg-[var(--surface)] p-5">
          <h2 className="text-base font-semibold">Comece por aqui</h2>
          <ol className="flex flex-col gap-2 text-sm text-[var(--foreground-muted)]">
            <li>
              1.{' '}
              <Link href="/ajustes/saldo" className="text-[var(--brand)] underline">
                Informe quanto você tem hoje
              </Link>{' '}
              — é a partir daí que o saldo é calculado.
            </li>
            <li>
              2.{' '}
              <Link href="/novo" className="text-[var(--brand)] underline">
                Lance o primeiro gasto
              </Link>
              . Leva dois toques.
            </li>
          </ol>
          <Link
            href="/novo"
            className="bg-primary text-primary-foreground flex min-h-12 items-center justify-center gap-2 rounded-xl text-base font-semibold"
          >
            <Plus className="size-5" aria-hidden />
            Novo lançamento
          </Link>
        </section>
      ) : (
        <>
          <Upcoming agenda={agenda} today={today} />
          <CategoryRanking
            slices={breakdown.slices}
            totalCents={breakdown.totalCents}
            month={breakdown.month}
          />
          <MonthlyBars data={monthly} today={today} />
        </>
      )}
    </main>
  )
}
