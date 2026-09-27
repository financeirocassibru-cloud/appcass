'use client'

import { useId, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Dois (ou mais) gráficos no mesmo espaço, trocados pelas setas. v1.0 — 2026-09-27.
 *
 * A Análise empilhava quatro gráficos, um embaixo do outro, e passava a sensação de coisa
 * embolada. Agora os pares que respondem perguntas vizinhas dividem um cartão:
 * Comprometimento ⇄ Mês a mês, e Saídas por categoria ⇄ Variação.
 *
 * O cabeçalho mostra o título e o recorte do painel atual, as setas e "1 de 2" — as setas
 * sozinhas não diriam que existe um segundo gráfico. Os painéis chegam já renderizados (os
 * gráficos de servidor continuam de servidor); este componente só decide qual aparece. Os
 * outros ficam montados e escondidos com `hidden`, para trocar não refazer o gráfico — e para
 * o estado de cada um (como o Pizza/Barras) sobreviver à ida e volta.
 *
 * Sem animação de deslize: a troca é instantânea, o que também atende a quem pede menos
 * movimento (`prefers-reduced-motion`) sem precisar de um caminho à parte.
 */

export interface CarouselPanel {
  key: string
  title: string
  /** O recorte que o painel cobre ("6 meses"). */
  caption?: string
  content: ReactNode
}

export function PanelCarousel({ panels, label }: { panels: CarouselPanel[]; label: string }) {
  const [index, setIndex] = useState(0)
  const baseId = useId()
  const total = panels.length
  const current = panels[index] ?? panels[0]
  if (!current) return null

  function go(delta: number) {
    setIndex((atual) => (atual + delta + total) % total)
  }

  const titleId = `${baseId}-titulo`

  return (
    <section
      aria-roledescription="carrossel"
      aria-label={label}
      className="flex flex-col gap-3"
    >
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-col">
          <h3 id={titleId} className="text-base leading-snug font-semibold" aria-live="polite">
            {current.title}
          </h3>
          {current.caption ? (
            <span className="text-xs text-[var(--foreground-muted)]">{current.caption}</span>
          ) : null}
        </div>
        {total > 1 ? (
          <div className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label={`Ver ${panels[(index - 1 + total) % total]?.title ?? 'anterior'}`}
              className="hover:bg-muted flex size-11 items-center justify-center rounded-full"
            >
              <ChevronLeft className="size-5" aria-hidden />
            </button>
            <span className="tabular w-10 text-center text-xs text-[var(--foreground-muted)]">
              {index + 1} de {total}
            </span>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label={`Ver ${panels[(index + 1) % total]?.title ?? 'próximo'}`}
              className="hover:bg-muted flex size-11 items-center justify-center rounded-full"
            >
              <ChevronRight className="size-5" aria-hidden />
            </button>
          </div>
        ) : null}
      </div>

      {panels.map((panel, position) => (
        <div
          key={panel.key}
          role="group"
          aria-roledescription="painel"
          aria-labelledby={position === index ? titleId : undefined}
          hidden={position !== index}
          className={cn(position !== index && 'hidden')}
        >
          {panel.content}
        </div>
      ))}
    </section>
  )
}
