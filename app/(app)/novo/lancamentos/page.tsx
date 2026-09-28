import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { isAiConfigured } from '@/lib/ai/env'
import { listActiveCategories } from '@/lib/db/queries/categories'
import { listCreatedFeed, listImportBatches } from '@/lib/db/queries/created-feed'
import { getCreditLedger } from '@/lib/db/queries/credit'
import { toCreditOptions } from '@/lib/finance/credit'
import { createdDay, feedCursor } from '@/lib/feed'
import { todayISO } from '@/lib/finance/date'
import { formatDayLabel, groupByDay } from '@/lib/finance/grouping'
import { FeedList } from './feed-list'

/**
 * "Todos os lançamentos" (o "Ver todos" do [+]): tudo o que foi cadastrado, na ordem em que
 * foi gravado. v1.3 — 2026-09-27.
 *
 * v1.3: lê os cartões e empréstimos para a edição ter o "Pago com" — antes ela abria sem ele,
 * diferente do [+] e do Histórico.
 *
 * v1.2: a seleção também categoriza, por palavra-chave e por IA (`RecategorizeSheet`).
 *
 * v1.1: o nome acompanhou o link, que virou "Ver todos"; e a lista ganhou modo seleção, com
 * exclusão em lote e o atalho que marca uma importação de extrato inteira (`FeedList`).
 *
 * O Histórico responde "quando o dinheiro entrou ou saiu"; esta tela responde "o que eu
 * registrei, e quando". Um lançamento de ontem para o mês que vem aparece aqui em cima, e lá
 * no mês que vem. Serve para conferir o que acabou de ser lançado — inclusive por importação
 * ou pelo assistente — e corrigir na hora.
 *
 * Os dias são os de **criação**, no fuso do app (`createdDay`), e a data de competência vai
 * na linha, como "para 05/10".
 */

// v1.3 — 27/09/2026: só o nome da tela; o "· Cass" vem do `template` do layout raiz.
export const metadata = { title: 'Todos os lançamentos' }
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 40

export default async function VerLancamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ antes?: string }>
}) {
  const { antes } = await searchParams
  const today = todayISO()

  const [{ items, hasMore }, expenseCategories, incomeCategories, ledger] = await Promise.all([
    listCreatedFeed({ limit: PAGE_SIZE, before: antes }),
    listActiveCategories('expense'),
    listActiveCategories('income'),
    getCreditLedger(today),
  ])
  // v1.3 — 2026-09-27: inclusive arquivados, para a compra num cartão arquivado abrir com ele.
  const creditAccounts = toCreditOptions(ledger.accounts, ledger.bills, true)

  const groups = groupByDay(items, (item) => createdDay(item.createdAt)).map((group) => ({
    date: group.date,
    label: formatDayLabel(group.date, today),
    items: group.items,
  }))
  const last = items.at(-1)

  // As importações citadas nesta página, com o tamanho inteiro de cada uma.
  const batchIds = [
    ...new Set(items.flatMap((item) => (item.type === 'entry' && item.importBatchId ? [item.importBatchId] : []))),
  ]
  const batches = await listImportBatches(batchIds)

  return (
    <main className="mx-auto flex max-w-md flex-col gap-5 px-6 py-8">
      <header className="flex flex-col gap-2">
        <Link href="/novo" className="text-muted-foreground flex min-h-11 items-center gap-1 text-sm">
          <ChevronLeft className="size-4" aria-hidden />
          Novo lançamento
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Todos os lançamentos</h1>
        <p className="text-muted-foreground text-sm">
          Na ordem em que foram cadastrados — o mais recente primeiro. Parcelamentos aparecem uma
          vez, e não parcela por parcela.
        </p>
      </header>

      {groups.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          {antes ? 'Não há nada mais antigo.' : 'Nada cadastrado ainda.'}
        </p>
      ) : (
        <FeedList
          groups={groups}
          batches={batches}
          expenseCategories={expenseCategories}
          incomeCategories={incomeCategories}
          today={today}
          aiAvailable={isAiConfigured()}
          creditAccounts={creditAccounts}
        />
      )}

      <nav className="flex items-center justify-between gap-3" aria-label="Páginas">
        {antes ? (
          <Link href="/novo/lancamentos" className="min-h-11 py-3 text-sm text-[var(--brand)]">
            Mais recentes
          </Link>
        ) : (
          <span />
        )}
        {hasMore && last ? (
          <Link
            href={{ pathname: '/novo/lancamentos', query: { antes: feedCursor(last) } }}
            className="min-h-11 py-3 text-sm font-medium text-[var(--brand)]"
          >
            Mais antigos
          </Link>
        ) : null}
      </nav>
    </main>
  )
}
