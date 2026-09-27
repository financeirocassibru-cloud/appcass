import Link from 'next/link'
import {
  analysisPeriod,
  getCategoryDeviation,
  getCategoryTotalsForPeriod,
  getCommitment,
  ANALYSIS_MONTHS,
  type AnalysisMonths,
} from '@/lib/db/queries/summary'
import { formatMonthLong } from '@/lib/finance/series'
import type { ISODate } from '@/lib/finance/date'
import { CategoryRanking } from '@/components/finance/charts/category-ranking'
import { CategoryDeviationChart } from '@/components/finance/charts/category-deviation'
import { CommitmentBars } from '@/components/finance/charts/commitment-bars'
import { analysisHref, type RawAnalysisParams } from './params'
import { cn } from '@/lib/utils'

/**
 * As análises de meses fechados.
 *
 * v1.0 — 2026-09-27.
 *
 * **Trabalham em meses inteiros, e não na janela do gráfico**, de propósito. Comparar 17 dias de
 * setembro com a média de meses cheios acusaria queda em tudo; e somar previsão ao "onde gastei"
 * responderia a pergunta com o próprio palpite. O gráfico acima responde "como vai ser"; isto
 * responde "como foi".
 *
 * Por isso o seletor de meses é separado do período do gráfico — são dois recortes diferentes,
 * e fingir que são o mesmo é o que tornaria os números errados.
 */
export async function MonthlyAnalysis({
  months,
  params,
  today,
}: {
  months: AnalysisMonths
  params: RawAnalysisParams
  today: ISODate
}) {
  const period = analysisPeriod(today, months)

  const [categories, commitment, deviation] = await Promise.all([
    getCategoryTotalsForPeriod(period),
    getCommitment(period),
    getCategoryDeviation(period),
  ])

  const first = period.months[0]
  const caption = `${months} meses`

  const baselineFirst = period.baselineMonths[0]
  const baselineLast = period.baselineMonths[period.baselineMonths.length - 1]
  const baselineCaption =
    baselineFirst && baselineLast
      ? `os ${months} meses anteriores (${formatMonthLong(baselineFirst)} a ${formatMonthLong(baselineLast)})`
      : 'os meses anteriores'

  return (
    <div className="flex flex-col gap-6 border-t pt-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">Como foi</h2>
        <p className="text-xs text-[var(--foreground-muted)]">
          Meses fechados, contados de {formatMonthLong(first ?? '')} para cá. É um recorte
          diferente do período do gráfico acima.
        </p>

        <nav aria-label="Período das análises" className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-1">
          {ANALYSIS_MONTHS.map((option) => (
            <Link
              key={option}
              href={analysisHref(params, { meses: String(option) })}
              aria-current={months === option ? 'page' : undefined}
              className={cn(
                'flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium transition-colors',
                months === option
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-input bg-card text-foreground',
              )}
            >
              {option} meses
            </Link>
          ))}
        </nav>
      </div>

      <CommitmentBars months={commitment} caption={caption} />

      <CategoryRanking
        slices={categories.slices}
        totalCents={categories.totalCents}
        caption={caption}
      />

      <CategoryDeviationChart
        rows={deviation}
        caption={caption}
        baselineCaption={baselineCaption}
      />
    </div>
  )
}
