'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { BarChart3, List } from 'lucide-react'
import type { Route } from 'next'
import type { Category } from '@/lib/db/queries/categories'
import type { EntryWithCategory } from '@/lib/db/queries/entries'
import type { CreditOption } from '@/lib/finance/credit'
import { addDays, type ISODate } from '@/lib/finance/date'
import {
  bucketize,
  type BucketPoint,
  type Granularity,
} from '@/lib/finance/buckets'
import { overrideTargetOf } from '@/lib/finance/projection'
import type { DayProjection, Occurrence } from '@/lib/finance/types'
import { BalanceWindow, type WindowEdge } from '@/components/finance/charts/balance-window'
import {
  ChartExpander,
  type ChartRenderContext,
} from '@/components/finance/charts/chart-expander'
import { PeriodPanel } from '@/components/finance/charts/period-panel'
import { Button } from '@/components/ui/button'
import { OccurrenceActions } from './occurrence-actions'
import { WindowList } from './window-list'
import { cn } from '@/lib/utils'

/**
 * A janela da Análise: o gráfico navegável, o detalhamento do período tocado e a visão em lista.
 *
 * v1.0 — 2026-09-27.
 *
 * v1.2 — 2026-09-27: repassa `creditAccounts` ao painel e à lista, para o formulário de
 * lançamento ter o "Pago com" também aqui.
 *
 * v1.3 — 28/09/2026: o gráfico vai ao `ChartExpander` como função, para receber a altura da tela
 * quando ampliado no computador. Fechado, ou no celular, a altura é a padrão de `BalanceWindow`.
 *
 * **O período vive na URL**, e não em `useState`. É o que `horizon-tabs.tsx` já praticava, e aqui
 * é obrigatório por um motivo mais duro: o servidor é quem calcula a janela, então se a extensão
 * do gráfico morasse no cliente, gráfico e lista discordariam sobre qual período está na tela —
 * duas fontes de verdade para a mesma pergunta.
 *
 * Arrastar até a borda pede mais janela, e o pedido é **um por parada do arrasto**: um `timeout`
 * limpo a cada evento de rolagem, mais uma trava de "em voo". Sem as duas, cada quadro do gesto
 * dispararia uma navegação.
 */

/** Quanto a janela cresce de cada vez que o arrasto chega na borda. */
const STEP_DAYS = 60
/** Espera depois do último evento de rolagem antes de pedir mais janela. */
const SETTLE_MS = 280

export function AnalysisWindow({
  days,
  realDays,
  granularity,
  today,
  windowFrom,
  focusFrom,
  focusTo,
  historyStartsOn,
  firstNegativeDay,
  entriesById,
  expenseCategories,
  incomeCategories,
  creditAccounts,
  scenarioId,
  adjustedTargets,
}: {
  days: DayProjection[]
  realDays: DayProjection[] | null
  granularity: Granularity
  today: ISODate
  windowFrom: ISODate
  focusFrom: ISODate
  focusTo: ISODate
  historyStartsOn: ISODate
  firstNegativeDay: ISODate | null
  entriesById: Record<string, EntryWithCategory>
  expenseCategories: Category[]
  incomeCategories: Category[]
  /** v1.2 — 2026-09-27: cartões e empréstimos (inclusive arquivados) para o "Pago com". */
  creditAccounts: CreditOption[]
  /** `null` quando a janela é a projeção real. */
  scenarioId: string | null
  /** `targetType:targetId:occurrenceKey` dos alvos que já têm ajuste, para a linha oferecer o
   *  desfazer. */
  adjustedTargets: string[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [view, setView] = useState<'chart' | 'list'>('chart')
  const [panelMode, setPanelMode] = useState<'reading' | 'form'>('reading')
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlight = useRef(false)

  const points = useMemo(() => bucketize(days, granularity, today), [days, granularity, today])
  const realPoints = useMemo(
    () => (realDays ? bucketize(realDays, granularity, today) : null),
    [realDays, granularity, today],
  )

  const selected = points.find((point) => point.key === selectedKey) ?? null

  const adjusted = useMemo(() => new Set(adjustedTargets), [adjustedTargets])

  /**
   * Os ajustes de cenário, por ocorrência.
   *
   * Só de hoje para frente: `projectWindow` não aplica cenário ao passado, então oferecer o
   * botão ali prometeria um efeito que a curva não teria. E nunca num item hipotético — ele já É
   * do cenário; o que se faz com ele é excluir, na lista de itens.
   */
  const renderActions = useCallback(
    (occurrence: Occurrence) => {
      if (!scenarioId) return null
      if (occurrence.origin === 'scenario') return null
      // v1.1 — 2026-09-27 (Fase 13): a fatura é derivada das compras — não tem alvo de ajuste.
      if (occurrence.origin === 'credit_bill') return null
      if (occurrence.date < today) return null

      const target = overrideTargetOf(occurrence)
      return (
        <OccurrenceActions
          scenarioId={scenarioId}
          target={target}
          description={occurrence.description}
          currentAmountCents={occurrence.amountCents}
          currentDate={occurrence.date}
          isAdjusted={adjusted.has(
            `${target.targetType}:${target.targetId}:${target.occurrenceKey ?? ''}`,
          )}
        />
      )
    },
    [scenarioId, today, adjusted],
  )

  const widen = useCallback(
    (edge: WindowEdge) => {
      if (inFlight.current) return

      if (settleTimer.current) clearTimeout(settleTimer.current)
      settleTimer.current = setTimeout(() => {
        inFlight.current = true
        const next = new URLSearchParams(searchParams.toString())
        if (edge === 'start') next.set('de', addDays(focusFrom, -STEP_DAYS))
        else next.set('ate', addDays(focusTo, STEP_DAYS))

        // `replace`, e não `push`: com `push` o botão voltar percorreria cada arrasto.
        // `scroll: false` porque a página não deve pular para o topo a cada ampliação.
        router.replace(`/analise?${next.toString()}` as Route, { scroll: false })

        // A trava cai quando o servidor responde e esta árvore recebe props novas; um
        // `useTransition` não serviria, porque o `pending` dele limpa antes de a resposta pintar.
        setTimeout(() => {
          inFlight.current = false
        }, 600)
      }, SETTLE_MS)
    },
    [router, searchParams, focusFrom, focusTo],
  )

  const panel = selected ? (
    <PeriodPanel
      point={selected}
      today={today}
      entriesById={entriesById}
      expenseCategories={expenseCategories}
      incomeCategories={incomeCategories}
      creditAccounts={creditAccounts}
      onFormOpenChange={(open) => setPanelMode(open ? 'form' : 'reading')}
      onClose={() => setSelectedKey(null)}
      renderActions={renderActions}
    />
  ) : undefined

  // v1.3 — 28/09/2026: função, e não elemento — `height` só vem definido ampliado no computador.
  const chart = ({ height }: ChartRenderContext) => (
    <BalanceWindow
      points={points}
      realPoints={realPoints}
      granularity={granularity}
      today={today}
      windowFrom={windowFrom}
      focusFrom={focusFrom}
      firstNegativeDay={firstNegativeDay}
      selectedKey={selectedKey}
      onSelect={(point: BucketPoint | null) => {
        setSelectedKey(point?.key ?? null)
        setPanelMode('reading')
      }}
      onReachEdge={widen}
      canLoadMoreStart={windowFrom > historyStartsOn}
      height={height}
    />
  )

  return (
    <div className="flex flex-col gap-3">
      <ViewToggle view={view} onChange={setView} />

      {view === 'chart' ? (
        <ChartExpander
          chart={chart}
          panel={panel}
          // Digitar dentro de um conteúdo girado por CSS é desconfortável: o teclado sobe pelo
          // lado físico e cobre o campo. Com o formulário aberto a rotação sai de cena.
          rotationSuspended={panelMode === 'form'}
          label="o gráfico de saldo"
        />
      ) : (
        <WindowList
          days={days}
          today={today}
          entriesById={entriesById}
          expenseCategories={expenseCategories}
          incomeCategories={incomeCategories}
          creditAccounts={creditAccounts}
          renderActions={renderActions}
        />
      )}
    </div>
  )
}

function ViewToggle({
  view,
  onChange,
}: {
  view: 'chart' | 'list'
  onChange: (view: 'chart' | 'list') => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Como ver o período"
      className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1"
    >
      {(
        [
          { value: 'chart', label: 'Gráfico', Icon: BarChart3 },
          { value: 'list', label: 'Lista', Icon: List },
        ] as const
      ).map((option) => (
        <Button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={view === option.value}
          variant="ghost"
          onClick={() => onChange(option.value)}
          className={cn(
            'min-h-11 gap-2 rounded-md text-sm font-semibold',
            view === option.value ? 'bg-card shadow-sm' : 'text-muted-foreground',
          )}
        >
          <option.Icon className="size-4" aria-hidden />
          {option.label}
        </Button>
      ))}
    </div>
  )
}
