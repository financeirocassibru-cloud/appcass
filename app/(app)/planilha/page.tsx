import { getSheet } from '@/lib/db/queries/sheet'
import { listImportedDescriptions } from '@/lib/db/queries/entries'
import { listScenarios } from '@/lib/db/queries/scenarios'
import { todayISO } from '@/lib/finance/date'
import { SheetPage } from './sheet-page'
import { DesktopOnly } from './desktop-only'
import { parseSheetParams, type RawSheetParams } from './params'

/**
 * "Ver como planilha" — v1.0 — 28/09/2026 (Fase 14).
 *
 * Receitas e despesas mês a mês, como uma planilha de gastos: um mês por coluna, total por seção,
 * "Quanto sobrou" e o saldo no fim do mês. Só no computador (a partir de `lg`): no celular a
 * página mostra o aviso de `DesktopOnly`, e a grade nem é montada no layout.
 *
 * A montagem é de `lib/finance/sheet.ts` (pura, testada); a leitura, de
 * `lib/db/queries/sheet.ts`, com as mesmas fontes da Análise. Toda edição passa pelas Server
 * Actions de sempre — ver `components/finance/sheet/sheet-view.tsx`.
 */

export const metadata = { title: 'Planilha' }
export const dynamic = 'force-dynamic'

export default async function PlanilhaPage({ searchParams }: { searchParams: Promise<RawSheetParams> }) {
  const raw = await searchParams
  const today = todayISO()
  const params = parseSheetParams(raw, today)

  const [{ sheet, context }, scenarios, suggestions] = await Promise.all([
    getSheet({ ...params, today }),
    listScenarios(),
    listImportedDescriptions(),
  ])
  const scenario = params.scenarioId ? scenarios.find((s) => s.id === params.scenarioId) : undefined

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8 lg:max-w-none lg:px-10 lg:py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Planilha</h1>
        <p className="text-muted-foreground hidden text-sm lg:block">
          Receitas e despesas mês a mês. Os meses que passaram mostram o que aconteceu; o atual e os
          próximos, também o que está previsto.
        </p>
      </div>
      <DesktopOnly />
      <div className="hidden lg:block">
        <SheetPage
          sheet={sheet}
          context={context}
          raw={raw}
          params={params}
          scenarios={scenarios}
          scenarioName={scenario?.name ?? null}
          suggestions={suggestions}
        />
      </div>
    </main>
  )
}
