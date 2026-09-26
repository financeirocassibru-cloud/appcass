import Link from 'next/link'
import { Plus } from 'lucide-react'
import { listRecurringRules } from '@/lib/db/queries/recurring'
import { todayISO } from '@/lib/finance/date'
import { RuleCard } from './rule-card'

export const metadata = { title: 'Contas fixas · Finanças' }
/** Lê o banco e calcula o próximo vencimento a partir de hoje. */
export const dynamic = 'force-dynamic'

export default async function CompromissosPage() {
  const today = todayISO()
  const rules = await listRecurringRules()

  const active = rules.filter((rule) => rule.isActive)
  const inactive = rules.filter((rule) => !rule.isActive)

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Contas fixas</h1>
        <Link href="/compromissos/nova" className="text-sm font-medium text-[var(--brand)]">
          Nova
        </Link>
      </div>

      {rules.length === 0 ? (
        <div className="flex flex-col gap-4 rounded-xl bg-[var(--surface)] p-5">
          <p className="text-sm text-[var(--foreground-muted)]">
            Uma conta fixa é uma regra, não um lançamento: o aluguel entra aqui uma vez e aparece
            na agenda todo mês, esperando você marcar como pago. Nada é registrado no extrato até
            lá.
          </p>
          <Link
            href="/compromissos/nova"
            className="bg-primary text-primary-foreground flex min-h-12 items-center justify-center gap-2 rounded-xl text-base font-semibold"
          >
            <Plus className="size-5" aria-hidden />
            Criar a primeira
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {active.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {active.map((rule) => (
                <RuleCard key={rule.id} rule={rule} today={today} />
              ))}
            </ul>
          ) : (
            <p className="rounded-xl bg-[var(--surface)] p-4 text-sm text-[var(--foreground-muted)]">
              Nenhuma conta fixa ativa. As desativadas continuam abaixo.
            </p>
          )}

          {inactive.length > 0 ? (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-[var(--foreground-muted)]">Desativadas</h2>
              <ul className="flex flex-col gap-3">
                {inactive.map((rule) => (
                  <RuleCard key={rule.id} rule={rule} today={today} />
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </main>
  )
}
