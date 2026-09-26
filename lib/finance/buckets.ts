import {
  eachDay,
  endOfMonth,
  endOfWeek,
  monthKey,
  monthsBetween,
  startOfMonth,
  startOfWeek,
  type ISODate,
} from './date'
import { formatMonthLabel } from './series'
import type { DayProjection, Occurrence } from './types'

/**
 * Agrega a série diária em pontos de dia, semana ou mês.
 *
 * v1.0 — 2026-09-26: nasce com a Análise. A projeção sempre foi diária, e numa janela de seis
 * meses isso são 180 pontos num gráfico de celular — um borrão. Escolher a escala é o que faz a
 * janela longa continuar legível.
 *
 * Duas regras não se negociam:
 *
 * - **O valor do ponto é o saldo de FECHAMENTO, nunca a média.** A média de um período que foi
 *   de 5.000 a −200 é 2.400, um número que não existiu em momento nenhum e que esconde
 *   exatamente o dia que importa.
 * - **O piso do período viaja junto** (`minBalanceCents`, `firstNegativeDate`). Sem ele, uma
 *   semana que mergulha na terça e fecha positiva na sexta apaga o mergulho, e o gráfico passa
 *   a afirmar "nunca ficou negativo" — o oposto do que `docs/DESIGN.md` pede desta tela.
 *
 * Pura: `today` entra por parâmetro (invariante 9) e serve só para marcar o que é fato.
 */

export type Granularity = 'day' | 'week' | 'month'

export interface BucketPoint {
  /**
   * Estável e ordenável: `2026-09-26`, `w:2026-09-21`, `m:2026-09`. Serve de `key` no React e
   * de `dataKey` no eixo.
   *
   * A semana é identificada pela segunda-feira dela, e **não** por número ISO de semana:
   * semana 53 e a semana que atravessa a virada do ano são dois jeitos de errar sem ganho
   * nenhum aqui.
   */
  key: string
  /** Primeiro e último dia do bucket **dentro da janela** — bucket de borda é recortado. */
  from: ISODate
  to: ISODate
  /** Rótulo do eixo: `26/09`, `21–27/09`, `set`. */
  label: string
  /** Saldo no fim de `to`. Nunca média. */
  closingBalanceCents: number
  inflowCents: number
  outflowCents: number
  /** Menor e maior saldo **dentro** do bucket. É o que impede o agregado de esconder o piso. */
  minBalanceCents: number
  maxBalanceCents: number
  /** Primeiro dia com saldo negativo dentro do bucket, se houver. */
  firstNegativeDate: ISODate | null
  /** As ocorrências de todos os dias do bucket, em ordem de data. */
  occurrences: Occurrence[]
  dayCount: number
  /**
   * `true` quando a borda da janela cortou o bucket. O saldo de fechamento continua verdadeiro
   * — é o saldo daquele dia —, mas entrada e saída são parciais, e a tela precisa poder dizer
   * isso em vez de deixar comparar meio mês com um mês inteiro.
   */
  isPartial: boolean
  containsToday: boolean
  /** `true` quando o bucket inteiro está antes de hoje: fato, não previsão. */
  isHistory: boolean
}

function keyOf(date: ISODate, granularity: Granularity): string {
  if (granularity === 'day') return date
  if (granularity === 'week') return `w:${startOfWeek(date)}`
  return `m:${monthKey(date)}`
}

/** `dd/mm` a partir da string, sem passar por `Date` no fuso local (invariante 2). */
function shortDate(date: ISODate): string {
  const [, month, day] = date.split('-')
  return `${day}/${month}`
}

function labelOf(
  granularity: Granularity,
  from: ISODate,
  to: ISODate,
  referenceMonth: string,
): string {
  if (granularity === 'day') return shortDate(from)
  if (granularity === 'month') return formatMonthLabel(monthKey(from), referenceMonth)

  // Semana: `21–27/09` quando começa e termina no mesmo mês, `29/09–05/10` quando atravessa.
  const [, fromMonth, fromDay] = from.split('-')
  if (fromMonth === to.split('-')[1]) return `${fromDay}–${shortDate(to)}`
  return `${shortDate(from)}–${shortDate(to)}`
}

export function bucketize(
  days: readonly DayProjection[],
  granularity: Granularity,
  today: ISODate,
): BucketPoint[] {
  if (days.length === 0) return []

  const windowFrom = days[0]!.date
  const windowTo = days[days.length - 1]!.date
  const referenceMonth = monthKey(windowFrom)

  // Ordem de aparição, não ordem de chave: a série chega contígua e crescente de
  // `accumulate`, e é essa ordem que o eixo tem de manter.
  const order: string[] = []
  const grouped = new Map<string, DayProjection[]>()
  for (const day of days) {
    const key = keyOf(day.date, granularity)
    const bucket = grouped.get(key)
    if (bucket) {
      bucket.push(day)
    } else {
      grouped.set(key, [day])
      order.push(key)
    }
  }

  return order.map((key) => {
    const group = grouped.get(key)!
    const first = group[0]!
    const last = group[group.length - 1]!

    let inflowCents = 0
    let outflowCents = 0
    let minBalanceCents = first.balanceCents
    let maxBalanceCents = first.balanceCents
    let firstNegativeDate: ISODate | null = null
    const occurrences: Occurrence[] = []

    for (const day of group) {
      inflowCents += day.inflowCents
      outflowCents += day.outflowCents
      if (day.balanceCents < minBalanceCents) minBalanceCents = day.balanceCents
      if (day.balanceCents > maxBalanceCents) maxBalanceCents = day.balanceCents
      if (firstNegativeDate === null && day.balanceCents < 0) firstNegativeDate = day.date
      occurrences.push(...day.occurrences)
    }

    // O bucket é parcial quando suas bordas naturais caem fora da janela.
    const naturalFrom =
      granularity === 'day'
        ? first.date
        : granularity === 'week'
          ? startOfWeek(first.date)
          : startOfMonth(first.date)
    const naturalTo =
      granularity === 'day'
        ? last.date
        : granularity === 'week'
          ? endOfWeek(last.date)
          : endOfMonth(last.date)

    return {
      key,
      from: first.date,
      to: last.date,
      label: labelOf(granularity, first.date, last.date, referenceMonth),
      closingBalanceCents: last.balanceCents,
      inflowCents,
      outflowCents,
      minBalanceCents,
      maxBalanceCents,
      firstNegativeDate,
      occurrences,
      dayCount: group.length,
      isPartial: naturalFrom < windowFrom || naturalTo > windowTo,
      containsToday: first.date <= today && today <= last.date,
      isHistory: last.date < today,
    }
  })
}

/** Quantos buckets cobrem o intervalo fechado `[from, to]`. Zero se estiver invertido. */
export function bucketCountBetween(
  from: ISODate,
  to: ISODate,
  granularity: Granularity,
): number {
  if (from > to) return 0
  if (granularity === 'month') return monthsBetween(from, to) + 1
  // `eachDay` já é a contagem de dias do intervalo, e a janela tem teto de poucos milhares de
  // dias — não vale um helper novo só para não alocar as strings.
  const dayCount = eachDay(from, to).length
  if (granularity === 'day') return dayCount
  // Entre as duas segundas-feiras: `eachDay` é inclusivo nas duas pontas, então o número de
  // saltos de semana é `(dias - 1) / 7`, e o total de semanas é um a mais.
  const mondaySpan = eachDay(startOfWeek(from), startOfWeek(to)).length - 1
  return mondaySpan / 7 + 1
}

/**
 * Quantos pixels o conteúdo cresceu à esquerda quando a janela foi ampliada.
 *
 * Ao buscar mais passado, a mesma data passa a ficar num deslocamento maior dentro do
 * rolador — sem compensar, a vista salta para trás no meio do arrasto. A conta é em
 * **buckets**, não em dias: em escala semanal, 14 dias novos são 2 pontos, não 14.
 */
export function scrollAnchorShiftPx(
  previousFrom: ISODate,
  nextFrom: ISODate,
  granularity: Granularity,
  pxPerPoint: number,
): number {
  if (nextFrom >= previousFrom) return 0
  // O bucket que contém `previousFrom` era o primeiro; agora está neste índice.
  return (bucketCountBetween(nextFrom, previousFrom, granularity) - 1) * pxPerPoint
}

/** Largura em pixels de cada ponto, por escala. Define quando o gráfico passa a ser arrastável. */
export const PX_PER_POINT: Record<Granularity, number> = {
  day: 14,
  week: 36,
  month: 64,
}

/**
 * A escala que cabe numa janela desta extensão.
 *
 * Só serve de padrão: `?escala=` explícito sempre vence e sobrevive ao arrasto. Sem isto, abrir
 * dois anos de histórico renderizaria 730 pontos de uma vez.
 */
export function defaultGranularity(from: ISODate, to: ISODate): Granularity {
  const dayCount = bucketCountBetween(from, to, 'day')
  if (dayCount <= 62) return 'day'
  if (dayCount <= 370) return 'week'
  return 'month'
}
