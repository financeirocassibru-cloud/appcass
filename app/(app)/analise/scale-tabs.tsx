import Link from 'next/link'
import type { Granularity } from '@/lib/finance/buckets'
import { analysisHref, SCALE_PARAM, type RawAnalysisParams } from './params'
import { cn } from '@/lib/utils'

/**
 * Dia, semana ou mês.
 *
 * v1.0 — 2026-09-27: substitui o `HorizonTabs`, que oferecia 30/90/180 **dias** — três extensões
 * de janela, nunca uma escala. Numa janela de seis meses a escala diária são 180 pontos, e é a
 * escolha da escala que a mantém legível.
 *
 * Links, e não `useState`: a escala fica na URL, junto com o período, porque é o servidor que
 * calcula a janela.
 */
export function ScaleTabs({
  current,
  params,
}: {
  current: Granularity
  params: RawAnalysisParams
}) {
  const options: { value: Granularity; label: string }[] = [
    { value: 'day', label: 'Dia' },
    { value: 'week', label: 'Semana' },
    { value: 'month', label: 'Mês' },
  ]

  return (
    <nav aria-label="Escala do gráfico" className="bg-muted grid grid-cols-3 gap-1 rounded-lg p-1">
      {options.map((option) => (
        <Link
          key={option.value}
          href={analysisHref(params, { escala: SCALE_PARAM[option.value] })}
          aria-current={current === option.value ? 'page' : undefined}
          className={cn(
            'flex min-h-11 items-center justify-center rounded-md text-sm font-semibold transition-colors',
            current === option.value ? 'bg-card shadow-sm' : 'text-muted-foreground',
          )}
        >
          {option.label}
        </Link>
      ))}
    </nav>
  )
}
