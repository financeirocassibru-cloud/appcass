import Link from 'next/link'
import { Plus } from 'lucide-react'
import type { Route } from 'next'
import type { EntryKind } from '@/lib/db/types'
import { listRecurringRules } from '@/lib/db/queries/recurring'
import { todayISO } from '@/lib/finance/date'
import { RuleCard } from './rule-card'

/**
 * A lista de regras de um tipo: contas fixas (`expense`) ou renda fixa (`income`).
 *
 * v1.0 — 2026-09-27: extraída de `compromissos/page.tsx` quando as duas se separaram. Antes
 * elas dividiam uma lista só, e o salário aparecia entre o aluguel e a internet. A tabela
 * continua uma só (`recurring_rules`, com `kind`) — a separação é de tela, não de dado.
 *
 * "Nova" leva ao [+] com o modo já escolhido: é lá que tudo é cadastrado.
 */
export async function RuleList({ kind }: { kind: EntryKind }) {
  const today = todayISO()
  const rules = await listRecurringRules(kind)

  const active = rules.filter((rule) => rule.isActive)
  const inactive = rules.filter((rule) => !rule.isActive)

  const copy =
    kind === 'expense'
      ? {
          title: 'Contas fixas',
          newHref: '/novo?modo=fixa' as Route,
          empty:
            'Uma conta fixa é uma regra, não um lançamento: o aluguel entra aqui uma vez e aparece na agenda todo mês, esperando você marcar como pago. Nada é registrado no histórico até lá.',
          none: 'Nenhuma conta fixa ativa. As desativadas continuam abaixo.',
        }
      : {
          title: 'Renda fixa',
          newHref: '/novo?tipo=entrada&modo=fixa' as Route,
          empty:
            'Renda fixa é o que entra todo mês sem você precisar lembrar: o salário, um aluguel que você recebe. Ela aparece na agenda e na projeção, esperando você marcar como recebida.',
          none: 'Nenhuma renda fixa ativa. As desativadas continuam abaixo.',
        }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{copy.title}</h1>
        <Link href={copy.newHref} className="text-sm font-medium text-[var(--brand)]">
          Nova
        </Link>
      </div>

      {rules.length === 0 ? (
        <div className="flex flex-col gap-4 rounded-xl bg-[var(--surface)] p-5">
          <p className="text-sm text-[var(--foreground-muted)]">{copy.empty}</p>
          <Link
            href={copy.newHref}
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
              {copy.none}
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
