import Link from 'next/link'
import type { ScenarioSummary } from '@/lib/db/queries/scenarios'
import { cn } from '@/lib/utils'

/**
 * Escolha entre a projeção real e os cenários.
 *
 * Links, não estado de cliente: a escolha fica na URL, sobrevive ao
 * recarregamento e pode ser compartilhada.
 *
 * `cenario=real` é explícito de propósito. Sem o parâmetro, a tela abre o
 * cenário marcado como padrão — e sem um valor que diga "nenhum" não haveria
 * como voltar à projeção real depois de marcar um.
 */
export function ScenarioPicker({
  scenarios,
  selectedId,
  horizon,
}: {
  scenarios: ScenarioSummary[]
  selectedId: string | null
  horizon: number
}) {
  if (scenarios.length === 0) return null

  return (
    <nav aria-label="Cenário" className="flex flex-col gap-2">
      <div className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-1">
        <Link
          href={{ pathname: '/projecao', query: { dias: String(horizon), cenario: 'real' } }}
          aria-current={selectedId === null ? 'page' : undefined}
          className={cn(
            'flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium transition-colors',
            selectedId === null
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-input bg-card text-foreground',
          )}
        >
          Real
        </Link>

        {scenarios.map((scenario) => (
          <Link
            key={scenario.id}
            href={{ pathname: '/projecao', query: { dias: String(horizon), cenario: scenario.id } }}
            aria-current={selectedId === scenario.id ? 'page' : undefined}
            className={cn(
              'flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium transition-colors',
              selectedId === scenario.id
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-input bg-card text-foreground',
            )}
          >
            {scenario.name}
          </Link>
        ))}
      </div>

      {selectedId !== null ? (
        <p className="text-xs text-[var(--foreground-muted)]">
          Você está vendo uma simulação. Seus lançamentos não mudam.
        </p>
      ) : null}
    </nav>
  )
}
