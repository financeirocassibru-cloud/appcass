'use client'

import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  PX_PER_POINT,
  scrollAnchorShiftPx,
  type BucketPoint,
  type Granularity,
} from '@/lib/finance/buckets'
import { formatCents, formatCentsCompact } from '@/lib/finance/money'
import { niceTicksRange, tickOffsets } from '@/lib/finance/series'
import type { ISODate } from '@/lib/finance/date'

/**
 * Saldo ao longo de uma janela que atravessa passado e futuro, navegável por arrasto.
 *
 * v1.0 — 2026-09-27: substitui `balance-area.tsx` na Análise. Aquele desenhava 90 dias de largura
 * fixa, sem clique e sem arrasto, e a única forma de ler um valor era passar o cursor — que em
 * celular não existe.
 *
 * Forma e cor seguem a skill `dataviz`:
 *
 * - **Linha contra uma linha de base.** O limite é o zero, e é a pergunta que a tela existe para
 *   responder: em que dia o dinheiro acaba. A parte abaixo do zero muda de cor, com duas áreas
 *   ancoradas em `baseValue={0}` — e não um gradiente, que o Recharts ancoraria na caixa do
 *   traçado e pintaria de vermelho uma faixa **acima** do zero (o erro registrado no arquivo que
 *   este substitui).
 * - **O passado é traço cheio, o futuro é tracejado.** Tracejado lê como "projeção", que é
 *   exatamente o que é. As duas metades compartilham o ponto de hoje, para os segmentos se
 *   tocarem.
 * - **Na escala de semana ou mês entra uma segunda linha: o menor saldo do período.** Sem ela o
 *   agregado esconde o mergulho — uma semana que vai a −800 na terça e fecha positiva na sexta
 *   apagaria o único dia que importa. Duas séries, então legenda, que é o que a skill exige; a
 *   regra "uma série só, sem legenda" de `docs/DESIGN.md` foi emendada por isso, no mesmo PR.
 *   O par violeta/vermelho foi medido: ΔE 31,9 no claro e 28,6 no escuro sob deuteranopia,
 *   contra o alvo de 8, com contraste ≥ 3:1 nos dois temas.
 * - **O eixo Y é DOM, não SVG**, e fica fora do rolador. Dentro dele rolaria junto com os dados;
 *   um segundo gráfico sobreposto obrigaria a manter altura, margem e domínio de dois gráficos em
 *   sincronia. As marcas vêm de `niceTicksRange` e as posições de `tickOffsets`, as duas puras e
 *   testadas.
 * - **A rolagem é nativa.** Arrasto em JS obrigaria a reescrever inércia, rubber-banding e
 *   desambiguação de eixo, e re-renderizaria o gráfico a cada quadro de ponteiro.
 */

const PLOT_HEIGHT = 220
/**
 * A faixa do eixo X entra na altura do contêiner. Deixá-la fora faz o cartão ganhar uma
 * rolagem vertical minúscula só para os rótulos dos dias.
 */
const X_AXIS_HEIGHT = 24
const CHART_HEIGHT = PLOT_HEIGHT + X_AXIS_HEIGHT
const AXIS_WIDTH = 72
const MARGIN = { top: 8, right: 12, bottom: 0, left: 0 }
/** A quantos pixels da borda o arrasto pede mais janela. */
const EDGE_PX = 48

export type WindowEdge = 'start' | 'end'

interface Row extends BucketPoint {
  /** Saldo de fechamento na metade passada; `null` no futuro, para o traço cheio parar em hoje. */
  past: number | null
  /** A mesma curva na metade futura. O ponto de hoje entra nas duas, senão abre um vão. */
  future: number | null
  positive: number
  negative: number
  minLine: number | null
  /** A mesma janela sem o cenário. `null` quando não há cenário aplicado. */
  real: number | null
}

export function BalanceWindow({
  points,
  realPoints,
  granularity,
  today,
  windowFrom,
  focusFrom,
  firstNegativeDay,
  selectedKey,
  onSelect,
  onReachEdge,
  canLoadMoreStart,
  height = CHART_HEIGHT,
}: {
  points: BucketPoint[]
  /**
   * A mesma janela sem o cenário, quando há um aplicado. Desenhada como linha fina apagada:
   * sem ela dava para ver o resultado do cenário, mas não o efeito dele.
   */
  realPoints?: BucketPoint[] | null
  granularity: Granularity
  today: ISODate
  /** Primeiro dia carregado. Muda quando a janela amplia, e é a chave da reancoragem. */
  windowFrom: ISODate
  /** Onde a vista deve começar na primeira pintura. */
  focusFrom: ISODate
  firstNegativeDay: ISODate | null
  selectedKey: string | null
  onSelect: (point: BucketPoint | null) => void
  onReachEdge?: (edge: WindowEdge) => void
  /** `false` quando a janela já bateu na âncora: não há mais passado para pedir. */
  canLoadMoreStart: boolean
  height?: number
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const [scrollerWidth, setScrollerWidth] = useState(0)
  const previousFrom = useRef(windowFrom)
  const didInitialScroll = useRef(false)

  const pxPerPoint = PX_PER_POINT[granularity]

  // A largura precisa ser medida porque é ela que decide se o gráfico é arrastável. Um
  // `ResponsiveContainer` aqui mediria o div largo de dentro do rolador e realimentaria a
  // própria largura.
  useLayoutEffect(() => {
    const element = scroller.current
    if (!element) return

    setScrollerWidth(element.clientWidth)
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setScrollerWidth(entry.contentRect.width)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // Primeira pintura: leva a vista para onde a URL pediu, sem animação — é a posição inicial,
  // não um movimento.
  useLayoutEffect(() => {
    const element = scroller.current
    if (!element || didInitialScroll.current || scrollerWidth === 0) return
    didInitialScroll.current = true
    element.scrollLeft = scrollAnchorShiftPx(focusFrom, windowFrom, granularity, pxPerPoint)
  }, [focusFrom, windowFrom, granularity, pxPerPoint, scrollerWidth])

  // Janela ampliada à esquerda: a mesma data passou a ficar num deslocamento maior, e sem
  // compensar a vista salta para trás. Chaveado **só** em `windowFrom`: chaveado nos pontos, um
  // `router.refresh()` depois de salvar um lançamento reancoraria sem motivo.
  useLayoutEffect(() => {
    const element = scroller.current
    if (!element || previousFrom.current === windowFrom) return
    const shift = scrollAnchorShiftPx(previousFrom.current, windowFrom, granularity, pxPerPoint)
    previousFrom.current = windowFrom
    if (shift > 0) element.scrollLeft += shift
  }, [windowFrom, granularity, pxPerPoint])

  const handleScroll = useCallback(() => {
    const element = scroller.current
    if (!element || !onReachEdge) return

    // Durante o rubber-band do iOS o `scrollLeft` fica negativo; sem travar em zero cada
    // repique pediria mais janela.
    const left = Math.max(element.scrollLeft, 0)
    if (left < EDGE_PX && canLoadMoreStart) onReachEdge('start')
    else if (left + element.clientWidth > element.scrollWidth - EDGE_PX) onReachEdge('end')
  }, [onReachEdge, canLoadMoreStart])

  if (points.length === 0) return null

  // O domínio vem do **piso** e do teto de cada período, não dos fechamentos: com os
  // fechamentos, um mergulho no meio da semana cai fora da escala e o gráfico afirma que o
  // saldo nunca ficou negativo.
  const ticks = niceTicksRange(
    Math.min(...points.map((point) => point.minBalanceCents)),
    Math.max(...points.map((point) => point.maxBalanceCents)),
  )
  const domainLow = ticks[0] ?? 0
  const domainHigh = ticks[ticks.length - 1] ?? 0

  const showReal = Boolean(realPoints && realPoints.length === points.length)

  const showMinLine =
    granularity !== 'day' &&
    points.some((point) => point.minBalanceCents !== point.closingBalanceCents)

  const rows: Row[] = points.map((point, index) => ({
    ...point,
    // Mesma janela e mesma escala, então mesmos buckets na mesma ordem — o índice casa.
    real: showReal ? (realPoints?.[index]?.closingBalanceCents ?? null) : null,
    past: point.to <= today ? point.closingBalanceCents : null,
    future: point.to >= today ? point.closingBalanceCents : null,
    positive: Math.max(point.closingBalanceCents, 0),
    negative: Math.min(point.minBalanceCents, 0),
    minLine: showMinLine ? point.minBalanceCents : null,
  }))

  const todayKey = points.find((point) => point.containsToday)?.key ?? null
  const negativeKey = firstNegativeDay
    ? (points.find((point) => point.from <= firstNegativeDay && firstNegativeDay <= point.to)
        ?.key ?? null)
    : null

  const chartWidth = Math.max(scrollerWidth, points.length * pxPerPoint + AXIS_WIDTH / 2)
  const offsets = tickOffsets(ticks, height, MARGIN.top, X_AXIS_HEIGHT)

  return (
    <div className="flex flex-col gap-2">
      {showMinLine || showReal ? (
        <ChartLegend showMinLine={showMinLine} showReal={showReal} />
      ) : null}

      <div className="flex">
        {/* O eixo, fora do rolador: é o que o mantém parado enquanto os dados correm. */}
        <div
          aria-hidden
          className="relative w-[72px] shrink-0"
          style={{ height }}
        >
          {offsets.map((offset) => (
            <span
              key={offset.value}
              className="tabular absolute right-2 -translate-y-1/2 text-[11px] text-[var(--foreground-muted)]"
              style={{ top: offset.topPx }}
            >
              {formatCentsCompact(offset.value)}
            </span>
          ))}
        </div>

        {/* `aria-hidden`: o gráfico é decorativo para leitor de tela, e a lista ao lado dele
            carrega os mesmos números. `overscroll-x-contain` impede que arrastar na borda
            dispare o "voltar" por gesto do Android no meio do movimento. */}
        <div
          ref={scroller}
          aria-hidden
          onScroll={handleScroll}
          className="flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain [touch-action:pan-x]"
        >
          <ComposedChart
            data={rows}
            width={chartWidth}
            height={height}
            margin={MARGIN}
            onClick={(state) => {
              const index = state?.activeTooltipIndex
              onSelect(typeof index === 'number' ? (points[index] ?? null) : null)
            }}
            onMouseMove={(state) => {
              const index = state?.activeTooltipIndex
              if (typeof index === 'number' && points[index]) onSelect(points[index])
            }}
          >
            <CartesianGrid vertical={false} stroke="var(--border)" strokeWidth={1} />

            <XAxis
              dataKey="label"
              height={X_AXIS_HEIGHT}
              tickLine={false}
              axisLine={{ stroke: 'var(--border)' }}
              tick={{ fill: 'var(--foreground-muted)', fontSize: 11 }}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            {/* Escondido e sem largura: os rótulos moram no DOM ao lado. O domínio continua
                aqui, senão a grade e as áreas não caem nas mesmas marcas. */}
            <YAxis hide width={0} domain={[domainLow, domainHigh]} ticks={ticks} />

            <Area
              type="monotone"
              dataKey="positive"
              baseValue={0}
              stroke="none"
              fill="var(--chart-magnitude)"
              fillOpacity={0.18}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="negative"
              baseValue={0}
              stroke="none"
              fill="var(--chart-expense)"
              fillOpacity={0.18}
              isAnimationActive={false}
            />

            {/* O zero é a pergunta do gráfico, então ganha linha própria — depois das áreas,
                para não ficar por baixo delas. */}
            <ReferenceLine y={0} stroke="var(--foreground-muted)" strokeWidth={1} />
            {todayKey ? (
              <ReferenceLine
                x={todayKey}
                stroke="var(--foreground-muted)"
                strokeWidth={1}
                label={{ value: 'hoje', position: 'insideTopLeft', fontSize: 10, fill: 'var(--foreground-muted)' }}
              />
            ) : null}
            {negativeKey ? (
              <ReferenceLine x={negativeKey} stroke="var(--chart-expense)" strokeWidth={1} />
            ) : null}

            {showReal ? (
              <Line
                type="monotone"
                dataKey="real"
                stroke="var(--foreground-muted)"
                strokeWidth={1}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            ) : null}

            {showMinLine ? (
              <Line
                type="monotone"
                dataKey="minLine"
                stroke="var(--chart-expense)"
                strokeWidth={1}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            ) : null}

            <Line
              type="monotone"
              dataKey="past"
              stroke="var(--chart-magnitude)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="future"
              stroke="var(--chart-magnitude)"
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }}
              connectNulls={false}
              isAnimationActive={false}
            />

            <Tooltip
              content={<WindowTooltip />}
              cursor={{ stroke: 'var(--foreground-muted)', strokeWidth: 1 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </div>
      </div>

      <SelectedCaption
        point={points.find((point) => point.key === selectedKey) ?? null}
        granularity={granularity}
        hasNegative={firstNegativeDay !== null}
      />
    </div>
  )
}

/**
 * Mais de uma série obriga a legenda, e a legenda espelha a marca: traço para linha, não
 * quadrado. Com uma série só ela não aparece — o título já diz o que está plotado.
 */
function ChartLegend({
  showMinLine,
  showReal,
}: {
  showMinLine: boolean
  showReal: boolean
}) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--foreground-muted)]">
      <li className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="inline-block h-0.5 w-4 rounded-full"
          style={{ background: 'var(--chart-magnitude)' }}
        />
        {showReal ? 'com o cenário' : 'saldo no fim do período'}
      </li>
      {showReal ? (
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-px w-4"
            style={{ background: 'var(--foreground-muted)' }}
          />
          sem o cenário
        </li>
      ) : null}
      {showMinLine ? (
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-px w-4"
            style={{ background: 'var(--chart-expense)' }}
          />
          menor saldo do período
        </li>
      ) : null}
    </ul>
  )
}

/**
 * O detalhamento das transações do ponto tocado.
 *
 * Nunca é a única via para o número: a lista ao lado do gráfico mostra os mesmos lançamentos,
 * e é ela o caminho acessível.
 */
function WindowTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: { payload?: Row }[]
}) {
  const row = payload?.[0]?.payload
  if (!active || !row) return null

  const shown = row.occurrences.slice(0, 4)
  const rest = row.occurrences.length - shown.length

  return (
    <div className="max-w-56 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-3 text-xs shadow-lg">
      <p className="tabular font-semibold text-[var(--foreground)]">
        {formatCents(row.closingBalanceCents)}
      </p>
      <p className="text-[var(--foreground-muted)]">
        {row.dayCount === 1 ? row.label : `${row.label} · fim do período`}
        {row.isHistory ? '' : ' · previsto'}
      </p>

      {row.minBalanceCents !== row.closingBalanceCents ? (
        <p className="tabular mt-1 text-[var(--chart-expense)]">
          menor saldo: {formatCents(row.minBalanceCents)}
        </p>
      ) : null}

      {row.occurrences.length === 0 ? (
        <p className="mt-2 text-[var(--foreground-muted)]">Sem movimento.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-0.5">
          {shown.map((occurrence) => (
            <li key={occurrence.key} className="flex justify-between gap-2">
              <span className="min-w-0 flex-1 truncate">{occurrence.description}</span>
              <span
                className="tabular shrink-0"
                style={{
                  color:
                    occurrence.kind === 'income'
                      ? 'var(--chart-income)'
                      : 'var(--chart-expense)',
                }}
              >
                {occurrence.kind === 'income' ? '+' : '−'}
                {formatCents(occurrence.amountCents).replace('-', '')}
              </span>
            </li>
          ))}
          {rest > 0 ? (
            <li className="text-[var(--foreground-muted)]">e mais {rest}</li>
          ) : null}
        </ul>
      )}
    </div>
  )
}

/** A leitura do ponto selecionado, em texto, para quem não tem cursor nem toque preciso. */
function SelectedCaption({
  point,
  granularity,
  hasNegative,
}: {
  point: BucketPoint | null
  granularity: Granularity
  hasNegative: boolean
}) {
  if (point) {
    return (
      <p className="min-h-5 text-xs text-[var(--foreground-muted)]">
        <span className="font-semibold text-[var(--foreground)]">
          {formatCents(point.closingBalanceCents)}
        </span>{' '}
        em {point.label}
        {point.occurrences.length > 0
          ? ` · ${point.occurrences.length} ${point.occurrences.length === 1 ? 'movimento' : 'movimentos'}`
          : ' · sem movimento'}
        {point.isPartial ? ' · período incompleto' : ''}
      </p>
    )
  }

  return (
    <p className="min-h-5 text-xs text-[var(--foreground-muted)]">
      {hasNegative
        ? 'A área vermelha marca quando o saldo fica negativo.'
        : granularity === 'day'
          ? 'Toque num dia para ver os lançamentos dele.'
          : 'Toque num período para ver os lançamentos dele.'}
    </p>
  )
}
