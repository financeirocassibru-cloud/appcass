import { formatCents } from '@/lib/finance/money'
import type { CategoryDeviation } from '@/lib/finance/series'

/**
 * Onde este período saiu do próprio padrão.
 *
 * v1.0 — 2026-09-27.
 *
 * v1.1 — 2026-09-27: "Fora da curva" passou a se chamar **Variação**, e divide o espaço com
 * "Saídas por categoria" num carrossel da Análise.
 *
 * Pergunta diferente da do ranking: lá é "onde gastei mais", aqui é "o que mudou". Uma categoria
 * pequena que dobrou merece ser vista; a maior de todas, estável, não é notícia.
 *
 * **Forma: barra divergente a partir do zero**, que é o que a skill `dataviz` indica para
 * "acima/abaixo de uma linha de base".
 *
 * **Cor: duas cores que leem como opostas, mais o cinza no meio.** Quente para quem subiu
 * (`--chart-expense`), frio para quem caiu (`--chart-below`). Verde ficou fora de propósito: no
 * app ele significa dinheiro entrando, e gastar menos que a média não é uma entrada. O par foi
 * medido contra as superfícies reais: ΔE 27,1 no claro e 25,1 no escuro sob deuteranopia, contra
 * o alvo de 8.
 *
 * A cor não carrega sozinha a direção: a barra fica de um lado ou do outro do zero, e a variação
 * está escrita em cada linha. Server Component, zero JavaScript no cliente.
 */

/** Quantas categorias mostrar. Além disso a lista deixa de ser uma leitura e vira uma tabela. */
const MAX_ROWS = 6

export function CategoryDeviationChart({
  rows,
  caption,
  baselineCaption,
  embedded = false,
}: {
  rows: CategoryDeviation[]
  caption: string
  /** O que serve de comparação, dito por extenso. */
  baselineCaption: string
  /**
   * v1.1 — 2026-09-27: dentro de um carrossel da Análise (`PanelCarousel`), que já mostra o
   * título e o recorte no cabeçalho dele — aqui eles não se repetem.
   */
  embedded?: boolean
}) {
  const shown = rows.slice(0, MAX_ROWS)
  const widest = shown.reduce((max, row) => Math.max(max, Math.abs(row.deltaCents)), 0)

  return (
    <section
      aria-labelledby={embedded ? undefined : 'titulo-variacao'}
      aria-label={embedded ? 'Variação' : undefined}
      className="flex flex-col gap-3"
    >
      {embedded ? null : (
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="titulo-variacao" className="text-base font-semibold">
            Variação
          </h2>
          <span className="text-xs text-[var(--foreground-muted)]">{caption}</span>
        </div>
      )}

      {shown.length === 0 ? (
        <p className="rounded-xl bg-[var(--surface)] p-4 text-sm text-[var(--foreground-muted)]">
          Ainda não há histórico suficiente para comparar. Depois de alguns meses de lançamentos,
          este bloco aponta o que mudou.
        </p>
      ) : (
        <>
          <p className="text-xs text-[var(--foreground-muted)]">
            Média por mês contra {baselineCaption}.
          </p>

          <ul className="flex flex-col gap-2">
            {shown.map((row) => (
              <li key={row.categoryId ?? 'sem-categoria'} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 flex-1 truncate">{row.name}</span>
                  <span
                    className="tabular shrink-0 text-xs font-semibold"
                    style={{
                      color:
                        row.deltaCents > 0 ? 'var(--chart-expense)' : 'var(--chart-below)',
                    }}
                  >
                    {row.deltaCents > 0 ? '+' : '−'}
                    {formatCents(Math.abs(row.deltaCents))}
                    {/* Categoria nova não tem "+∞%": ela é dita como nova. */}
                    {row.isNew
                      ? ' · nova'
                      : row.deltaRatio !== null
                        ? ` · ${row.deltaRatio > 0 ? '+' : '−'}${Math.abs(Math.round(row.deltaRatio * 100))}%`
                        : ''}
                  </span>
                </div>

                {/* O zero no meio: a barra cresce para a direita quem subiu, para a esquerda quem
                    caiu. A linha do zero é sólida e recuada, como a grade dos outros gráficos. */}
                <div className="relative h-2" role="img" aria-label={ariaLabelFor(row)}>
                  <span
                    aria-hidden
                    className="absolute top-0 bottom-0 left-1/2 w-px bg-[var(--border)]"
                  />
                  <span
                    aria-hidden
                    className="absolute top-0 h-full rounded-sm"
                    style={
                      row.deltaCents > 0
                        ? {
                            left: '50%',
                            width: `${widthPercent(row.deltaCents, widest)}%`,
                            background: 'var(--chart-expense)',
                          }
                        : {
                            right: '50%',
                            width: `${widthPercent(row.deltaCents, widest)}%`,
                            background: 'var(--chart-below)',
                          }
                    }
                  />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

/** Metade da largura é cada braço, então o maior desvio ocupa 50%. */
function widthPercent(deltaCents: number, widest: number): number {
  if (widest === 0) return 0
  return (Math.abs(deltaCents) / widest) * 50
}

function ariaLabelFor(row: CategoryDeviation): string {
  const direction = row.deltaCents > 0 ? 'acima' : 'abaixo'
  const relative = row.isNew
    ? 'categoria nova'
    : row.deltaRatio !== null
      ? `${Math.abs(Math.round(row.deltaRatio * 100))} por cento`
      : ''
  return `${row.name}: ${formatCents(Math.abs(row.deltaCents))} ${direction} da média${relative ? `, ${relative}` : ''}.`
}
