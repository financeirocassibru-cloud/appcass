import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { getCardSheet } from '@/lib/db/queries/sheet'
import { listImportedDescriptions } from '@/lib/db/queries/entries'
import { todayISO } from '@/lib/finance/date'
import { DesktopOnly } from '../../desktop-only'
import { parseSheetParams, sheetHref, type RawSheetParams } from '../../params'
import { CardSheetPage } from './card-sheet-page'

/**
 * A planilha de um cartão ou empréstimo — v1.0 — 28/09/2026 (Fase 14).
 *
 * Aberta com dois cliques na linha da conta, na planilha principal, com o mesmo período e o mesmo
 * jeito de agrupar. Pagar e parcelar a fatura continuam na tela do cartão (`/cartoes/[id]`),
 * que é onde essas ações moram — aqui é leitura e edição das compras.
 */

export const metadata = { title: 'Planilha do cartão' }
export const dynamic = 'force-dynamic'

export default async function PlanilhaCartaoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<RawSheetParams>
}) {
  const [{ id }, raw] = await Promise.all([params, searchParams])
  const today = todayISO()
  const parsed = parseSheetParams(raw, today)

  const [result, suggestions] = await Promise.all([
    getCardSheet(id, { from: parsed.from, to: parsed.to, grouping: parsed.grouping, sort: parsed.sort, today }),
    listImportedDescriptions(),
  ])
  if (!result) notFound()
  const { sheet, account, context } = result

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8 lg:max-w-none lg:px-10 lg:py-10">
      <div className="flex flex-col gap-2">
        <Link
          href={sheetHref('/planilha', raw, {})}
          className="text-muted-foreground flex min-h-11 items-center gap-1 text-sm"
        >
          <ChevronLeft className="size-4" aria-hidden />
          Planilha
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{account.name}</h1>
        <p className="text-muted-foreground hidden text-sm lg:block">
          {account.kind === 'card'
            ? `Cartão · fecha dia ${account.closingDay}, vence dia ${account.dueDay}. `
            : 'Empréstimo. '}
          Para pagar ou parcelar uma fatura, use a{' '}
          <Link href={`/cartoes/${account.id}`} className="text-[var(--brand)] underline">
            tela do {account.kind === 'card' ? 'cartão' : 'empréstimo'}
          </Link>
          .
        </p>
      </div>
      <DesktopOnly />
      <div className="hidden lg:block">
        <CardSheetPage
          sheet={sheet}
          account={account}
          context={context}
          raw={raw}
          accountId={account.id}
          params={parsed}
          suggestions={suggestions}
        />
      </div>
    </main>
  )
}
