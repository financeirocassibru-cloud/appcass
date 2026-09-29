'use client'

import type { SheetContext } from '@/lib/db/queries/sheet'
import type { EntryKind } from '@/lib/db/types'
import type { CreditAccount } from '@/lib/finance/credit'
import type { CardSheet } from '@/lib/finance/sheet'
import { CardSheetView } from '@/components/finance/sheet/card-sheet-view'
import { patchToRaw, sheetHref, type RawSheetParams, type SheetParams } from '../../params'

/** A ponte entre a URL e a planilha do cartão — v1.0 — 28/09/2026 (Fase 14). */
export function CardSheetPage({
  sheet,
  account,
  context,
  raw,
  accountId,
  params,
  suggestions,
}: {
  sheet: CardSheet
  account: CreditAccount
  context: SheetContext
  raw: RawSheetParams
  accountId: string
  params: SheetParams
  suggestions: Record<EntryKind, string[]>
}) {
  return (
    <CardSheetView
      sheet={sheet}
      account={account}
      context={context}
      params={{ from: params.from, to: params.to, grouping: params.grouping, sort: params.sort }}
      hrefFor={(patch) => sheetHref(`/planilha/cartao/${accountId}`, raw, patchToRaw(patch))}
      suggestions={suggestions}
    />
  )
}
