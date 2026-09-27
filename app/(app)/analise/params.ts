import type { Route } from 'next'
import { addDays, isISODate, todayISO, type ISODate } from '@/lib/finance/date'
import {
  defaultGranularity,
  MAX_WINDOW_DAYS,
  type Granularity,
} from '@/lib/finance/buckets'
import { ANALYSIS_MONTHS, type AnalysisMonths } from '@/lib/finance/series'

/**
 * Os parâmetros da Análise, lidos da URL.
 *
 * v1.0 — 2026-09-27. Substitui o `?dias=30|90|180` da Projeção, que só sabia olhar para frente.
 *
 * v1.1 — 2026-09-27. Sem `de`/`ate` na URL, o período vem do padrão da pessoa — o último que
 * ela escolheu, guardado no perfil (`fallback`) — e só na falta dele dos 30 dias para trás e
 * 90 para frente de sempre.
 *
 * Nomes em português na URL (`de`, `ate`, `escala`), como `cenario` já era, e identificadores em
 * inglês no código — invariante 10 lido como ele é: a URL é interface.
 *
 * **Toda data passa por `isISODate` antes de chegar a qualquer conta de calendário.** Um
 * `?de=9999-99-99` digitado à mão faria `parseISODate` lançar `DateError` dentro de um Server
 * Component, e a pessoa receberia um 500 em vez da tela.
 */

export interface AnalysisParams {
  /** Início do período em foco. */
  focusFrom: ISODate
  /** Fim do período em foco. */
  focusTo: ISODate
  granularity: Granularity
  /** `undefined` = projeção real; uma string = o cenário escolhido. */
  scenarioParam: string | undefined
  /** Quantos meses as análises de fechamento comparam. */
  months: AnalysisMonths
}

export interface RawAnalysisParams {
  de?: string
  ate?: string
  escala?: string
  cenario?: string
  meses?: string
}

const SCALES: Record<string, Granularity> = {
  dia: 'day',
  semana: 'week',
  mes: 'month',
}

/** O rótulo na URL para cada escala — o caminho de volta de `SCALES`. */
export const SCALE_PARAM: Record<Granularity, string> = {
  day: 'dia',
  week: 'semana',
  month: 'mes',
}

/** Quanto do passado e do futuro a janela mostra quando ninguém pediu nada. */
const DEFAULT_PAST_DAYS = 30
const DEFAULT_FUTURE_DAYS = 90

export function parseAnalysisParams(
  raw: RawAnalysisParams,
  today: ISODate = todayISO(),
  /** O período padrão da pessoa, já resolvido para hoje. v1.1 — 2026-09-27. */
  fallback?: { from: ISODate; to: ISODate },
): AnalysisParams {
  const defaultFrom =
    fallback && isISODate(fallback.from) && fallback.from <= fallback.to
      ? fallback.from
      : addDays(today, -DEFAULT_PAST_DAYS)
  const defaultTo =
    fallback && isISODate(fallback.to) && fallback.from <= fallback.to
      ? fallback.to
      : addDays(today, DEFAULT_FUTURE_DAYS)

  const from = raw.de && isISODate(raw.de) ? raw.de : defaultFrom
  const requestedTo = raw.ate && isISODate(raw.ate) ? raw.ate : defaultTo

  // Intervalo invertido cai no padrão em vez de devolver uma janela vazia sem explicação.
  const focusFrom = from <= requestedTo ? from : defaultFrom
  // Teto de extensão: um `?de=1900-01-01` computaria dezenas de milhares de dias.
  const ceiling = addDays(focusFrom, MAX_WINDOW_DAYS)
  const focusTo = requestedTo > ceiling ? ceiling : requestedTo

  const parsedMonths = Number(raw.meses)
  const months = (ANALYSIS_MONTHS as readonly number[]).includes(parsedMonths)
    ? (parsedMonths as AnalysisMonths)
    : 6

  return {
    focusFrom,
    focusTo,
    // Sem `?escala=` a escala vem da extensão: dois anos em escala diária abririam 730 pontos.
    granularity: (raw.escala ? SCALES[raw.escala] : undefined) ?? defaultGranularity(focusFrom, focusTo),
    scenarioParam: raw.cenario,
    months,
  }
}

/**
 * Um link para a Análise preservando o que já está na URL.
 *
 * Existe porque `horizon-tabs.tsx` descartava `cenario` ao trocar de horizonte, ao contrário do
 * `scenario-picker.tsx`, que preservava `dias`. Com cinco parâmetros em jogo, cada controle
 * montar a query por conta própria é garantia de que um deles vai esquecer outro.
 */
export function analysisHref(
  current: RawAnalysisParams,
  overrides: Partial<Record<keyof RawAnalysisParams, string | undefined>>,
): Route {
  const query = new URLSearchParams()
  const merged = { ...current, ...overrides }

  for (const key of ['de', 'ate', 'escala', 'cenario', 'meses'] as const) {
    const value = merged[key]
    if (value) query.set(key, value)
  }

  const search = query.toString()
  return (search ? `/analise?${search}` : '/analise') as Route
}
