'use client'

import { useState } from 'react'
import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { NewScenarioForm } from '@/app/(app)/cenarios/new-form'
import type { ScenarioSummary } from '@/lib/db/queries/scenarios'
import type { ISODate } from '@/lib/finance/date'
import {
  ANALYSIS_PERIOD_LABELS,
  ANALYSIS_PERIODS,
  analysisPeriodRange,
  isAnalysisPeriod,
  matchAnalysisPeriod,
} from '@/lib/finance/periods'
import type { SheetGrouping, SheetSort } from '@/lib/finance/sheet'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * A barra da planilha — v1.0 — 28/09/2026 (Fase 14).
 *
 * Período (os mesmos atalhos da Análise, com "Próximos 12 meses" de padrão, e o período
 * específico com as duas datas), agrupar, ordenar e o cenário. Tudo mora na URL, e cada controle
 * troca só o seu parâmetro — o link de volta de `hrefFor` preserva os outros.
 *
 * O período daqui **não** vira o padrão da Análise (`saveAnalysisPeriod` não é chamado): a
 * planilha e a curva respondem perguntas diferentes, e escolher "Próximos 12 meses" aqui não deve
 * mudar o que a Análise abre amanhã.
 */

const CUSTOM = 'custom'

export interface ToolbarParams {
  from: ISODate
  to: ISODate
  grouping: SheetGrouping
  sort: SheetSort
  scenarioId?: string
}

/** O que um controle troca na URL. `scenarioId: null` tira o cenário. */
export type SheetPatch = Partial<Omit<ToolbarParams, 'scenarioId'>> & { scenarioId?: string | null }

export function SheetToolbar({
  today,
  params,
  hrefFor,
  scenarios,
}: {
  today: ISODate
  params: ToolbarParams
  /** O link com os parâmetros trocados. */
  hrefFor: (patch: SheetPatch) => Route
  /** `undefined` = sem controle de cenário (planilha do cartão). */
  scenarios?: ScenarioSummary[]
}) {
  const router = useRouter()
  const matched = matchAnalysisPeriod(params.from, params.to, today)
  const [customOpen, setCustomOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const period = customOpen || !matched ? CUSTOM : matched

  const go = (patch: SheetPatch) => router.replace(hrefFor(patch), { scroll: false })

  function choosePeriod(next: string) {
    if (next === CUSTOM) {
      setCustomOpen(true)
      return
    }
    if (!isAnalysisPeriod(next)) return
    setCustomOpen(false)
    const range = analysisPeriodRange(next, today)
    go({ from: range.from, to: range.to })
  }

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor="planilha-periodo" className="text-xs">
          Período
        </Label>
        <select
          id="planilha-periodo"
          value={period}
          onChange={(event) => choosePeriod(event.target.value)}
          className="border-input bg-card focus-visible:border-primary min-h-10 rounded-lg border px-3 text-sm outline-none"
        >
          <option value={CUSTOM}>Período específico</option>
          {ANALYSIS_PERIODS.map((option) => (
            <option key={option} value={option}>
              {ANALYSIS_PERIOD_LABELS[option]}
            </option>
          ))}
        </select>
      </div>

      {period === CUSTOM ? (
        <>
          <div className="flex flex-col gap-1">
            <Label htmlFor="planilha-de" className="text-xs">
              De
            </Label>
            <Input
              id="planilha-de"
              type="date"
              value={params.from}
              max={params.to}
              onChange={(event) => event.target.value && event.target.value <= params.to && go({ from: event.target.value })}
              className="min-h-10 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="planilha-ate" className="text-xs">
              Até
            </Label>
            <Input
              id="planilha-ate"
              type="date"
              value={params.to}
              min={params.from}
              onChange={(event) => event.target.value && event.target.value >= params.from && go({ to: event.target.value })}
              className="min-h-10 text-sm"
            />
          </div>
        </>
      ) : null}

      <div className="flex flex-col gap-1">
        <span id="planilha-agrupar" className="text-xs font-medium">
          Avulsos
        </span>
        <div role="radiogroup" aria-labelledby="planilha-agrupar" className="bg-muted flex gap-1 rounded-lg p-1">
          {(
            [
              ['category', 'Por categoria'],
              ['none', 'Um por linha'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={params.grouping === value}
              onClick={() => go({ grouping: value })}
              className={
                params.grouping === value
                  ? 'bg-card min-h-8 rounded-md px-3 text-xs font-semibold text-[var(--brand)] shadow-sm'
                  : 'text-muted-foreground min-h-8 rounded-md px-3 text-xs font-semibold'
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="planilha-ordem" className="text-xs">
          Ordenar por
        </Label>
        <select
          id="planilha-ordem"
          value={params.sort}
          onChange={(event) => go({ sort: event.target.value as SheetSort })}
          className="border-input bg-card focus-visible:border-primary min-h-10 rounded-lg border px-3 text-sm outline-none"
        >
          <option value="alpha">Ordem alfabética</option>
          <option value="occurred">Data em que gastou</option>
          <option value="created">Data de lançamento</option>
        </select>
      </div>

      {scenarios ? (
        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="planilha-cenario" className="text-xs">
              Cenário
            </Label>
            <select
              id="planilha-cenario"
              value={params.scenarioId ?? ''}
              onChange={(event) => go({ scenarioId: event.target.value || null })}
              className="border-input bg-card focus-visible:border-primary min-h-10 rounded-lg border px-3 text-sm outline-none"
            >
              <option value="">Sem cenário (o real)</option>
              {scenarios.map((scenario) => (
                <option key={scenario.id} value={scenario.id}>
                  {scenario.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="button" variant="outline" className="min-h-10" onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden />
            Novo cenário
          </Button>
          <Dialog open={creating} onOpenChange={setCreating}>
            <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>Novo cenário</DialogTitle>
                <DialogDescription>
                  Um cenário é uma pergunta — e se? Ele muda a planilha de hoje em diante e não toca
                  nos seus lançamentos. Depois de criar, escolha-o em “Cenário”.
                </DialogDescription>
              </DialogHeader>
              <NewScenarioForm
                today={today}
                defaultEnd={params.to > today ? params.to : today}
                onCreated={() => setCreating(false)}
              />
            </DialogContent>
          </Dialog>
        </div>
      ) : null}
    </div>
  )
}
