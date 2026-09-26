import Link from 'next/link'
import { ChevronRight, Plus } from 'lucide-react'
import { listGoals } from '@/lib/db/queries/goals'
import { monthlyContributionCents } from '@/lib/finance/goals'
import { formatCents } from '@/lib/finance/money'
import { todayISO } from '@/lib/finance/date'

export const metadata = { title: 'Metas · Finanças' }
export const dynamic = 'force-dynamic'

export default async function MetasPage() {
  const today = todayISO()
  const goals = await listGoals()

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Metas</h1>
        <Link href="/metas/nova" className="text-sm font-medium text-[var(--brand)]">
          Nova
        </Link>
      </div>

      {goals.length === 0 ? (
        <div className="flex flex-col gap-4 rounded-xl bg-[var(--surface)] p-5">
          <p className="text-sm text-[var(--foreground-muted)]">
            Uma meta é um valor e um prazo. O app calcula quanto guardar por mês e desconta esse
            aporte da projeção — para o saldo futuro não parecer maior do que vai ser.
          </p>
          <Link
            href="/metas/nova"
            className="bg-primary text-primary-foreground flex min-h-12 items-center justify-center gap-2 rounded-xl text-base font-semibold"
          >
            <Plus className="size-5" aria-hidden />
            Criar a primeira
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {goals.map((goal) => {
            const done = goal.remainingCents === 0
            const monthly = monthlyContributionCents(goal, today)

            return (
              <li key={goal.id}>
                <Link
                  href={{ pathname: '/metas/[id]', query: { id: goal.id } }}
                  className="flex flex-col gap-2 rounded-xl bg-[var(--surface)] p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {goal.name}
                        {done ? ' 🎉' : ''}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        <span className="tabular">{formatCents(goal.savedCents)}</span> de{' '}
                        <span className="tabular">{formatCents(goal.targetAmountCents)}</span>
                        {done
                          ? ' · concluída'
                          : monthly > 0
                            ? ` · guarde ${formatCents(monthly)}/mês`
                            : goal.targetDate === null
                              ? ' · sem prazo nem aporte definido'
                              : ''}
                      </p>
                    </div>
                    <span className="tabular shrink-0 text-sm font-semibold">
                      {Math.round(goal.pct)}%
                    </span>
                    <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
                  </div>

                  <div
                    role="progressbar"
                    aria-valuenow={Math.round(goal.pct)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${goal.name}: ${Math.round(goal.pct)}% concluída`}
                    className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-raised)]"
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(goal.pct, 100)}%`,
                        // Concluída ganha a cor de entrada de dinheiro; o resto
                        // usa a cor de marca, porque progresso não é direção de
                        // dinheiro.
                        backgroundColor: done ? 'var(--chart-income)' : 'var(--chart-magnitude)',
                      }}
                    />
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      <p className="text-xs text-[var(--foreground-muted)]">
        O aporte de cada meta aparece na{' '}
        <Link href="/projecao" className="text-[var(--brand)] underline">
          projeção
        </Link>{' '}
        como previsão, no último dia de cada mês. Ele não vira lançamento sozinho — só sai da conta
        quando você registrar o aporte aqui.
      </p>
    </main>
  )
}
