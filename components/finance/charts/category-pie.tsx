'use client'

import { useState, type ReactNode } from 'react'
import { Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { formatCents } from '@/lib/finance/money'
import type { CategorySlice } from '@/lib/finance/series'
import { cn } from '@/lib/utils'

/**
 * Saídas por categoria, em pizza. v1.0 — 2026-09-27.
 *
 * **Pizza por pedido explícito da pessoa**, com as barras a um toque (`CategorySpending`).
 * A skill `dataviz` aceita pizza para "parte do todo de relance" com **no máximo seis
 * fatias**, e é isso que ela faz aqui: as cinco maiores e "Outros". Comparar valores
 * próximos continua sendo trabalho de barra — por isso a legenda embaixo traz nome, valor e
 * porcentagem de cada fatia, e é ela, não o ângulo, o caminho para o número exato.
 *
 * Cor: `--chart-cat-1..5` na ordem das fatias, mais o cinza de "Outros" (`app/globals.css`,
 * validados com a volta completa da pizza). Sem verde nem vermelho, que no app são direção do
 * dinheiro. Um vão de 2px da cor da superfície separa as fatias vizinhas.
 */

/** Fatias com cor própria; o resto soma em "Outros". Seis no total, o teto da skill. */
const MAX_NAMED = 5

const COLORS = [
  'var(--chart-cat-1)',
  'var(--chart-cat-2)',
  'var(--chart-cat-3)',
  'var(--chart-cat-4)',
  'var(--chart-cat-5)',
]
const OTHER_COLOR = 'var(--chart-cat-other)'

const SIZE = 200

interface PieSlice {
  key: string
  name: string
  cents: number
  fill: string
}

/** As cinco maiores e a soma do resto — que continua fechando com o total. */
export function pieSlices(slices: readonly CategorySlice[]): PieSlice[] {
  const sorted = [...slices].filter((s) => s.totalCents > 0).sort((a, b) => b.totalCents - a.totalCents)
  // Uma fatia "Outros" que já veio agrupada entra na cauda: ela não é uma categoria.
  const named = sorted.filter((s) => s.categoryId !== null)
  const head = named.slice(0, MAX_NAMED)
  const headKeys = new Set(head.map((s) => s.categoryId))
  const rest = sorted.filter((s) => !headKeys.has(s.categoryId) || s.categoryId === null)
  const restCents = rest.reduce((total, s) => total + s.totalCents, 0)

  const result: PieSlice[] = head.map((slice, index) => ({
    key: slice.categoryId ?? slice.name,
    name: slice.name,
    cents: slice.totalCents,
    fill: COLORS[index] ?? OTHER_COLOR,
  }))
  if (restCents > 0) result.push({ key: 'outros', name: 'Outros', cents: restCents, fill: OTHER_COLOR })
  return result
}

export function CategoryPie({ slices, totalCents }: { slices: CategorySlice[]; totalCents: number }) {
  const data = pieSlices(slices)

  if (data.length === 0) {
    return (
      <p className="rounded-xl bg-[var(--surface)] p-4 text-sm text-[var(--foreground-muted)]">
        Nenhuma saída registrada neste período.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl bg-[var(--surface)] p-4">
      <p className="text-sm text-[var(--foreground-muted)]">
        Total de saídas:{' '}
        <span className="tabular font-semibold text-[var(--foreground)]">{formatCents(totalCents)}</span>
      </p>

      {/* O desenho é redundante com a legenda, que tem todos os números — por isso ele sai da
          árvore de acessibilidade e a legenda fica como a leitura. */}
      <div aria-hidden className="mx-auto w-full max-w-[220px]">
        <ResponsiveContainer width="100%" height={SIZE}>
          <PieChart>
            <Pie
              data={data}
              dataKey="cents"
              nameKey="name"
              outerRadius="95%"
              startAngle={90}
              endAngle={-270}
              stroke="var(--surface)"
              strokeWidth={2}
              isAnimationActive={false}
            />
            <Tooltip
              cursor={false}
              content={({ active, payload }) => {
                const item = payload?.[0]
                if (!active || !item) return null
                const cents = Number(item.value ?? 0)
                const share = totalCents === 0 ? 0 : (cents / totalCents) * 100
                return (
                  <div className="bg-card rounded-md border px-2.5 py-1.5 text-xs shadow-sm">
                    <p className="font-medium">{String(item.name)}</p>
                    <p className="tabular text-[var(--foreground-muted)]">
                      {formatCents(cents)} · {share.toFixed(0)}%
                    </p>
                  </div>
                )
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <ul className="flex flex-col gap-2" aria-label="Saídas por categoria">
        {data.map((slice) => {
          const share = totalCents === 0 ? 0 : (slice.cents / totalCents) * 100
          return (
            <li key={slice.key} className="flex items-center gap-2.5 text-sm">
              <span
                aria-hidden
                className="inline-block size-3 shrink-0 rounded-sm"
                style={{ background: slice.fill }}
              />
              <span className="min-w-0 flex-1 truncate">{slice.name}</span>
              <span className="tabular shrink-0 font-semibold">{formatCents(slice.cents)}</span>
              <span className="tabular w-9 shrink-0 text-right text-xs text-[var(--foreground-muted)]">
                {share.toFixed(0)}%
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * O cartão "Saídas por categoria": pizza por padrão, barras a um toque. v1.0 — 2026-09-27.
 *
 * As barras chegam prontas (`bars`), renderizadas no servidor por `CategoryRanking` — este
 * componente só escolhe qual das duas mostrar.
 */
export function CategorySpending({
  slices,
  totalCents,
  bars,
}: {
  slices: CategorySlice[]
  totalCents: number
  bars: ReactNode
}) {
  const [view, setView] = useState<'pie' | 'bars'>('pie')

  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label="Forma do gráfico" className="bg-muted grid grid-cols-2 gap-1 self-end rounded-lg p-1">
        {(
          [
            { value: 'pie', label: 'Pizza' },
            { value: 'bars', label: 'Barras' },
          ] as const
        ).map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={view === option.value}
            onClick={() => setView(option.value)}
            className={cn(
              'flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-semibold transition-colors',
              view === option.value ? 'bg-card shadow-sm' : 'text-muted-foreground',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      {view === 'pie' ? <CategoryPie slices={slices} totalCents={totalCents} /> : bars}
    </div>
  )
}
