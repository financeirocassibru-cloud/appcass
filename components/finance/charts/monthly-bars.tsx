'use client'

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { useState } from 'react'
import { formatMonthLabel, niceTicks, type MonthlyTotals } from '@/lib/finance/series'
import { formatCents, formatCentsCompact } from '@/lib/finance/money'

/**
 * Entradas e saídas mês a mês.
 *
 * Forma e cor seguem a skill `dataviz`, como `docs/DESIGN.md` manda:
 *
 * - **Colunas agrupadas**, não empilhadas: a pergunta é "entrou mais ou saiu
 *   mais neste mês", e empilhar soma duas coisas que não se somam.
 * - **Duas séries, então legenda sempre presente** — a cor nunca é o único canal
 *   de identidade. E a ordem é fixa: entrada à esquerda, saída à direita, todo
 *   mês. Quem não distingue verde de vermelho lê pela posição.
 * - **Preenchimento com `--chart-income` / `--chart-expense`**, que são passos
 *   validados para fundo de gráfico nos dois temas — não os tokens de texto, que
 *   reprovam na faixa de luminosidade (ver o comentário em `app/globals.css`).
 * - **Barra fina com topo arredondado e base reta**, 2px de respiro entre as duas
 *   do par, grade em linha de cabelo sólida.
 *
 * Mês sem lançamento chega como zero por `buildMonthlySeries` e ocupa seu lugar
 * no eixo: se sumisse, os meses vizinhos ficariam lado a lado como se fossem
 * consecutivos.
 */

const MAX_BAR = 18
/** Altura fixa: `ResponsiveContainer` precisa de um número, não de `%` do pai. */
const HEIGHT = 200

interface Hovered {
  month: string
  kind: 'income' | 'expense'
  cents: number
}

export function MonthlyBars({ data, today }: { data: MonthlyTotals[]; today: string }) {
  const [hovered, setHovered] = useState<Hovered | null>(null)
  const referenceMonth = today.slice(0, 7)

  const hasData = data.some((month) => month.incomeCents > 0 || month.expenseCents > 0)

  // Marcas do eixo em números redondos, e o topo do domínio na última delas: sem
  // isso a biblioteca escolhe valores como "R$ 3,5 mil", que o leitor precisa
  // decifrar antes de comparar duas colunas.
  const maxCents = data.reduce(
    (max, month) => Math.max(max, month.incomeCents, month.expenseCents),
    0,
  )
  const ticks = niceTicks(maxCents)
  const domainTop = ticks[ticks.length - 1] ?? 0

  const rows = data.map((month) => ({
    month: month.month,
    label: formatMonthLabel(month.month, referenceMonth),
    income: month.incomeCents,
    expense: month.expenseCents,
  }))

  return (
    <section aria-labelledby="titulo-meses" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="titulo-meses" className="text-base font-semibold">
          Mês a mês
        </h2>
        <span className="text-xs text-[var(--foreground-muted)]">últimos {data.length} meses</span>
      </div>

      {!hasData ? (
        <p className="rounded-xl bg-[var(--surface)] p-4 text-sm text-[var(--foreground-muted)]">
          Sem lançamentos nos últimos {data.length} meses. O gráfico aparece quando houver o
          primeiro.
        </p>
      ) : (
        <div className="flex flex-col gap-3 rounded-xl bg-[var(--surface)] p-4">
          {/* Legenda antes do gráfico: é o canal de identidade que não depende de
              enxergar a diferença entre as duas cores. */}
          <ul className="flex gap-4">
            <li className="flex items-center gap-2 text-xs text-[var(--foreground-muted)]">
              <span
                aria-hidden
                className="size-2.5 rounded-sm"
                style={{ backgroundColor: 'var(--chart-income)' }}
              />
              Entrou
            </li>
            <li className="flex items-center gap-2 text-xs text-[var(--foreground-muted)]">
              <span
                aria-hidden
                className="size-2.5 rounded-sm"
                style={{ backgroundColor: 'var(--chart-expense)' }}
              />
              Saiu
            </li>
          </ul>

          {/* O gráfico é decorativo para leitor de tela: a tabela abaixo carrega os
              mesmos números, e é ela que fica no fluxo acessível. */}
          <div aria-hidden className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height={HEIGHT}>
              <BarChart data={rows} barGap={2} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid
                  vertical={false}
                  stroke="var(--border)"
                  strokeWidth={1}
                  // Sólida: tracejado lê como projeção ou limite, e isto é só grade.
                />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={{ stroke: 'var(--border)' }}
                  tick={{ fill: 'var(--foreground-muted)', fontSize: 11 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  // Largura suficiente para "R$ 15 mil" inteiro. Estreitar aqui
                  // corta o "R$" da marca, que é o rótulo clipado que a skill
                  // `dataviz` lista como defeito.
                  width={72}
                  domain={[0, domainTop]}
                  ticks={ticks}
                  tick={{ fill: 'var(--foreground-muted)', fontSize: 11 }}
                  tickFormatter={(value: number) => formatCentsCompact(value)}
                />
                <Bar
                  dataKey="income"
                  fill="var(--chart-income)"
                  maxBarSize={MAX_BAR}
                  radius={[4, 4, 0, 0]}
                  onMouseEnter={(_, index) =>
                    setHovered({
                      month: rows[index]?.month ?? '',
                      kind: 'income',
                      cents: rows[index]?.income ?? 0,
                    })
                  }
                  onMouseLeave={() => setHovered(null)}
                />
                <Bar
                  dataKey="expense"
                  fill="var(--chart-expense)"
                  maxBarSize={MAX_BAR}
                  radius={[4, 4, 0, 0]}
                  onMouseEnter={(_, index) =>
                    setHovered({
                      month: rows[index]?.month ?? '',
                      kind: 'expense',
                      cents: rows[index]?.expense ?? 0,
                    })
                  }
                  onMouseLeave={() => setHovered(null)}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Leitura do valor apontado. Em celular não existe hover, então o número
              nunca fica só aqui: a tabela abaixo é a via garantida. */}
          <p className="min-h-5 text-xs text-[var(--foreground-muted)]" aria-hidden>
            {hovered ? (
              <>
                <span className="font-semibold text-[var(--foreground)]">
                  {formatCents(hovered.cents)}
                </span>{' '}
                {hovered.kind === 'income' ? 'entrou' : 'saiu'} em{' '}
                {formatMonthLabel(hovered.month, referenceMonth)}
              </>
            ) : (
              'Passe o cursor numa coluna para ver o valor — ou abra os números abaixo.'
            )}
          </p>

          <details className="text-xs">
            <summary className="min-h-11 cursor-pointer py-3 text-[var(--brand)]">
              Ver os números
            </summary>
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">
                Entradas e saídas por mês nos últimos {data.length} meses
              </caption>
              <thead>
                <tr className="text-[var(--foreground-muted)]">
                  <th scope="col" className="py-1 font-medium">
                    Mês
                  </th>
                  <th scope="col" className="py-1 text-right font-medium">
                    Entrou
                  </th>
                  <th scope="col" className="py-1 text-right font-medium">
                    Saiu
                  </th>
                </tr>
              </thead>
              <tbody className="tabular">
                {rows.map((row) => (
                  <tr key={row.month} className="border-border border-t">
                    <th scope="row" className="py-1.5 font-normal">
                      {row.label}
                    </th>
                    <td className="py-1.5 text-right">{formatCents(row.income)}</td>
                    <td className="py-1.5 text-right">{formatCents(row.expense)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>
      )}
    </section>
  )
}
