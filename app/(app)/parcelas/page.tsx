import Link from 'next/link'
import { ChevronRight, Plus } from 'lucide-react'
import { listInstallmentPlans } from '@/lib/db/queries/installments'
import { formatCents } from '@/lib/finance/money'

/**
 * Parcelamentos. v1.1 — 2026-09-27.
 *
 * v1.1: "Nova" leva ao [+] no modo Parcelado, onde o parcelamento é cadastrado agora —
 * inclusive um que já está em andamento.
 */

// v1.2 — 27/09/2026: só o nome da tela; o "· Cass" vem do `template` do layout raiz.
export const metadata = { title: 'Parcelas' }
export const dynamic = 'force-dynamic'

// v1.3 — 28/09/2026: layout de computador — a partir de `lg` (1024 px) a largura vai a `lg:max-w-4xl` (lista) e os cartões ficam em duas colunas. No celular continua `max-w-md`, uma coluna.
export default async function ParcelasPage() {
  const plans = await listInstallmentPlans()

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8 lg:max-w-4xl lg:px-10 lg:py-10">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Parcelas</h1>
        <Link href="/novo?modo=parcelado" className="text-sm font-medium text-[var(--brand)]">
          Nova
        </Link>
      </div>

      {plans.length === 0 ? (
        <div className="flex flex-col gap-4 rounded-xl bg-[var(--surface)] p-5">
          <p className="text-sm text-[var(--foreground-muted)]">
            Uma compra parcelada vira lançamentos de verdade na hora — a dívida já existe inteira
            no momento da compra. Cada parcela aparece na agenda no mês dela, esperando você
            marcar como paga.
          </p>
          <Link
            href="/novo?modo=parcelado"
            className="bg-primary text-primary-foreground flex min-h-12 items-center justify-center gap-2 rounded-xl text-base font-semibold"
          >
            <Plus className="size-5" aria-hidden />
            Criar o primeiro
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:gap-4">
          {plans.map((plan) => {
            const pct =
              plan.installmentsCount === 0
                ? 0
                : (plan.paidCount / plan.installmentsCount) * 100

            return (
              <li key={plan.planId}>
                <Link
                  href={{ pathname: '/parcelas/[id]', query: { id: plan.planId } }}
                  className="flex flex-col gap-2 rounded-xl bg-[var(--surface)] p-4 lg:h-full lg:transition-colors lg:hover:bg-[color-mix(in_srgb,var(--brand)_6%,var(--surface))]"
                >
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{plan.description}</p>
                      <p className="text-muted-foreground text-xs">
                        {plan.paidCount} de {plan.installmentsCount} pagas · falta{' '}
                        <span className="tabular">{formatCents(plan.remainingCents)}</span>
                      </p>
                    </div>
                    <span className="tabular shrink-0 text-sm font-semibold">
                      {formatCents(plan.totalAmountCents)}
                    </span>
                    <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
                  </div>

                  {/* Barra de progresso: a trilha é um passo da superfície, e o
                      preenchimento usa a cor de marca — verde e vermelho ficam
                      reservados a direção de dinheiro. */}
                  <div
                    role="progressbar"
                    aria-valuenow={plan.paidCount}
                    aria-valuemin={0}
                    aria-valuemax={plan.installmentsCount}
                    aria-label={`${plan.paidCount} de ${plan.installmentsCount} parcelas pagas`}
                    className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-raised)]"
                  >
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, backgroundColor: 'var(--chart-magnitude)' }}
                    />
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
