'use client'

import { useState } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts'
import { formatCents, formatCentsCompact } from '@/lib/finance/money'
import { niceTicksRange } from '@/lib/finance/series'
import type { DayProjection } from '@/lib/finance/types'

/**
 * Saldo projetado dia a dia.
 *
 * Forma e cor seguem a skill `dataviz`:
 *
 * - **Linha contra uma linha de base**, que é a forma que a skill indica para
 *   "acima/abaixo de um limite". O limite aqui é o zero, e é a única pergunta
 *   que importa: em que dia o dinheiro acaba.
 * - **Uma série só, então sem legenda** — o título já diz o que está plotado.
 * - **A parte abaixo do zero muda de cor**, que é o alerta pedido por
 *   `docs/DESIGN.md`. São duas áreas ancoradas no zero (`baseValue={0}`), uma
 *   para a parte positiva e outra para a negativa, e não um gradiente.
 *
 *   A primeira versão usava gradiente e estava **errada**: o Recharts preenche
 *   da linha até o piso do domínio, não até o zero, e um gradiente em
 *   `objectBoundingBox` se ancora na caixa do traçado. O resultado, visível ao
 *   renderizar, era uma faixa vermelha **acima** da linha do zero — o gráfico
 *   sinalizando saldo negativo onde ele era positivo.
 *
 *   A cor não carrega o aviso sozinha: o texto acima do gráfico nomeia o
 *   primeiro dia negativo, e a lista de dias abaixo é a via acessível ao mesmo
 *   dado.
 * - **Linha de 2px, área a ~12% de opacidade**, grade em linha de cabelo
 *   sólida, marcas do eixo em números redondos.
 *
 * As duas cores foram medidas com o validador da skill contra a superfície real
 * de cada tema: ΔE 31,9 no claro e 28,6 no escuro sob deuteranopia, bem acima
 * do alvo de 8, com contraste ≥ 3:1 nos dois.
 */

const HEIGHT = 220

export function BalanceArea({
  days,
  firstNegativeDay,
}: {
  days: DayProjection[]
  firstNegativeDay: string | null
}) {
  const [hovered, setHovered] = useState<DayProjection | null>(null)

  if (days.length === 0) return null

  const balances = days.map((day) => day.balanceCents)
  const ticks = niceTicksRange(Math.min(...balances), Math.max(...balances))
  const domainLow = ticks[0] ?? 0
  const domainHigh = ticks[ticks.length - 1] ?? 0

  // Duas séries derivadas da mesma curva, cada uma ancorada no zero: a
  // positiva é zero nos dias negativos e vice-versa, então cada área só
  // desenha no lado a que pertence.
  const rows = days.map((day) => ({
    date: day.date,
    label: shortDate(day.date),
    balance: day.balanceCents,
    positive: Math.max(day.balanceCents, 0),
    negative: Math.min(day.balanceCents, 0),
  }))

  return (
    <div className="flex flex-col gap-3">
      {/* O gráfico é decorativo para leitor de tela: a lista de dias abaixo
          carrega os mesmos números e fica no fluxo acessível. */}
      <div aria-hidden className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height={HEIGHT}>
          <ComposedChart
            data={rows}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            onMouseMove={(state) => {
              const index = state?.activeTooltipIndex
              setHovered(typeof index === 'number' ? (days[index] ?? null) : null)
            }}
            onMouseLeave={() => setHovered(null)}
          >
            <CartesianGrid vertical={false} stroke="var(--border)" strokeWidth={1} />

            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: 'var(--border)' }}
              tick={{ fill: 'var(--foreground-muted)', fontSize: 11 }}
              // 90 marcas não cabem; o Recharts escolhe quantas mostrar sem
              // sobrepor rótulo.
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={72}
              domain={[domainLow, domainHigh]}
              ticks={ticks}
              tick={{ fill: 'var(--foreground-muted)', fontSize: 11 }}
              tickFormatter={(value: number) => formatCentsCompact(value)}
            />

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

            {/* O zero é a pergunta do gráfico, então ganha uma linha própria —
                sólida e um passo acima da grade. Depois das áreas, para não
                ficar por baixo delas. */}
            <ReferenceLine y={0} stroke="var(--foreground-muted)" strokeWidth={1} />

            <Line
              type="monotone"
              dataKey="balance"
              stroke="var(--chart-magnitude)"
              strokeWidth={2}
              // Sem ponto por dia: 90 pontos viram um borrão. O ponto aparece
              // onde o cursor está.
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <p className="min-h-5 text-xs text-[var(--foreground-muted)]" aria-hidden>
        {hovered ? (
          <>
            <span className="font-semibold text-[var(--foreground)]">
              {formatCents(hovered.balanceCents)}
            </span>{' '}
            em {longDate(hovered.date)}
            {hovered.occurrences.length > 0
              ? ` · ${hovered.occurrences.length} ${
                  hovered.occurrences.length === 1 ? 'movimento' : 'movimentos'
                }`
              : ''}
          </>
        ) : firstNegativeDay ? (
          `A área vermelha marca os dias em que o saldo fica negativo.`
        ) : (
          'Passe o cursor no gráfico para ver o saldo de cada dia.'
        )}
      </p>
    </div>
  )
}

/** `dd/mm` a partir da string, sem passar por `Date` no fuso local. */
function shortDate(date: string): string {
  const [, month, day] = date.split('-')
  return `${day}/${month}`
}

function longDate(date: string): string {
  const [year, month, day] = date.split('-')
  return `${day}/${month}/${year}`
}
