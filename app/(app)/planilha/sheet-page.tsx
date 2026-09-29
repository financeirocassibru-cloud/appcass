'use client'

import type { SheetContext } from '@/lib/db/queries/sheet'
import type { ScenarioSummary } from '@/lib/db/queries/scenarios'
import type { EntryKind } from '@/lib/db/types'
import type { Sheet } from '@/lib/finance/sheet'
import { SheetView } from '@/components/finance/sheet/sheet-view'
import { patchToRaw, sheetHref, type RawSheetParams, type SheetParams } from './params'

/**
 * A ponte entre a URL e a planilha — v1.0 — 28/09/2026 (Fase 14). Os links são montados aqui, do
 * lado do cliente, porque uma função não atravessa de um Server Component para um Client
 * Component.
 */

export function SheetPage({
  sheet,
  context,
  raw,
  params,
  scenarios,
  scenarioName,
  suggestions,
}: {
  sheet: Sheet
  context: SheetContext
  raw: RawSheetParams
  params: SheetParams
  scenarios: ScenarioSummary[]
  scenarioName: string | null
  suggestions: Record<EntryKind, string[]>
}) {
  return (
    <SheetView
      sheet={sheet}
      context={context}
      params={{ ...params, scenarioId: params.scenarioId }}
      hrefFor={(patch) => sheetHref('/planilha', raw, patchToRaw(patch))}
      // A planilha do cartão herda o período e o jeito de agrupar; o cenário não vale lá.
      cardHref={(accountId) => sheetHref(`/planilha/cartao/${accountId}`, raw, { cenario: undefined })}
      scenarios={scenarios}
      scenarioName={scenarioName}
      suggestions={suggestions}
    />
  )
}
