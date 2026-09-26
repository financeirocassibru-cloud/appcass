import Link from 'next/link'
import { AlertTriangle, TrendingUp } from 'lucide-react'
import { getProjection } from '@/lib/db/queries/projection'
import { formatDayLabel } from '@/lib/finance/grouping'
import { formatCents } from '@/lib/finance/money'
import { todayISO } from '@/lib/finance/date'
import { BalanceArea } from '@/components/finance/charts/balance-area'
import { Balance, Money } from '@/components/finance/money'
import { HorizonTabs } from './horizon-tabs'

export const metadata = { title: 'Projeção · Finanças' }
/** Depende de "hoje" e do banco: prerenderizada, congelaria os dois. */
export const dynamic = 'force-dynamic'

const HORIZONS = [30, 90, 180] as const
type Horizon = (typeof HORIZONS)[number]

function parseHorizon(value: string | undefined): Horizon {
  const parsed = Number(value)
  return (HORIZONS as readonly number[]).includes(parsed) ? (parsed as Horizon) : 90
}

export default async function ProjecaoPage({
  searchParams,
}: {
  // Next 16: `searchParams` é assíncrono (invariante 12).
  searchParams: Promise<{ dias?: string }>
}) {
  const params = await searchParams
  const horizon = parseHorizon(params.dias)
  const today = todayISO()

  const projection = await getProjection(horizon, today)

  // Só os dias com movimento: uma lista de 90 dias em que 70 estão vazios não é
  // um fluxo, é um rolo. O gráfico já mostra a continuidade.
  const activeDays = projection.days.filter((day) => day.occurrences.length > 0)
  const hasAnything = activeDays.length > 0

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Projeção</h1>
        <p className="text-sm text-[var(--foreground-muted)]">
          Parte do seu saldo de hoje e soma o que está por vir.
        </p>
      </div>

      <HorizonTabs current={horizon} options={HORIZONS} />

      <section className="flex flex-col gap-3 rounded-2xl bg-[var(--surface)] p-5">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="text-xs text-[var(--foreground-muted)]">Saldo hoje</p>
            <Balance cents={projection.openingBalanceCents} className="text-xl" />
          </div>
          <div className="text-right">
            <p className="text-xs text-[var(--foreground-muted)]">
              Em {horizon} dias
            </p>
            <Balance
              cents={projection.days.at(-1)?.balanceCents ?? projection.openingBalanceCents}
              className="text-xl"
            />
          </div>
        </div>

        <BalanceArea days={projection.days} firstNegativeDay={projection.firstNegativeDay} />
      </section>

      {/* O alerta é texto, não só a cor do gráfico: quem não distingue a área
          vermelha tem de receber o mesmo aviso. */}
      {projection.firstNegativeDay ? (
        <p className="flex items-start gap-2 rounded-xl bg-[var(--surface)] p-4 text-sm">
          <AlertTriangle
            className="mt-0.5 size-4 shrink-0 text-[var(--expense)]"
            aria-hidden
          />
          <span>
            <span className="font-semibold text-[var(--expense)]">
              O saldo fica negativo em {formatDayLabel(projection.firstNegativeDay, today)}
            </span>
            . Dá para adiar ou cancelar algo antes disso?
          </span>
        </p>
      ) : (
        <p className="flex items-start gap-2 rounded-xl bg-[var(--surface)] p-4 text-sm">
          <TrendingUp className="mt-0.5 size-4 shrink-0 text-[var(--income)]" aria-hidden />
          <span>O saldo não fica negativo nos próximos {horizon} dias.</span>
        </p>
      )}

      {/* Contas vencidas foram empurradas para hoje. É uma suposição, e dizer
          isso importa mais que escondê-la: sem ela a projeção pareceria melhor
          do que é. */}
      {projection.overdueCents !== 0 ? (
        <p className="text-xs text-[var(--foreground-muted)]">
          Inclui <span className="tabular">{formatCents(Math.abs(projection.overdueCents))}</span>{' '}
          de contas já vencidas, contadas no primeiro dia —{' '}
          <Link href="/lancamentos?status=pendente" className="text-[var(--brand)] underline">
            ver quais
          </Link>
          .
        </p>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Dia a dia</h2>

        {!hasAnything ? (
          <p className="rounded-xl bg-[var(--surface)] p-4 text-sm text-[var(--foreground-muted)]">
            Nenhum movimento previsto nos próximos {horizon} dias. Cadastre uma{' '}
            <Link href="/compromissos" className="text-[var(--brand)] underline">
              conta fixa
            </Link>{' '}
            para a projeção ter o que somar.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {activeDays.map((day) => (
              <li key={day.date} className="flex flex-col gap-2 rounded-xl bg-[var(--surface)] p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium">{formatDayLabel(day.date, today)}</span>
                  <span className="text-xs text-[var(--foreground-muted)]">
                    saldo{' '}
                    <span
                      className={`tabular font-semibold ${
                        day.balanceCents < 0 ? 'text-[var(--expense)]' : 'text-[var(--foreground)]'
                      }`}
                    >
                      {formatCents(day.balanceCents)}
                    </span>
                  </span>
                </div>

                <ul className="flex flex-col gap-1">
                  {day.occurrences.map((occurrence) => (
                    <li
                      key={occurrence.key}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="text-muted-foreground min-w-0 flex-1 truncate">
                        {occurrence.description}
                        {/* Previsto e realizado não são a mesma coisa, e a
                            diferença muda o que a pessoa faz com a informação. */}
                        {occurrence.isRealized ? '' : ' · previsto'}
                      </span>
                      <Money
                        cents={occurrence.amountCents}
                        kind={occurrence.kind}
                        className="shrink-0 text-sm"
                      />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-[var(--foreground-muted)]">
        Cenários — simular um gasto a mais, adiar uma conta — entram na fase 5b.
      </p>
    </main>
  )
}
