import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { listActiveCategories } from '@/lib/db/queries/categories'
import { listCreatedFeed } from '@/lib/db/queries/created-feed'
import { createdDay, feedCursor } from '@/lib/feed'
import { todayISO } from '@/lib/finance/date'
import { formatDayLabel, groupByDay } from '@/lib/finance/grouping'
import { FeedRow } from './feed-row'

/**
 * "Ver lançamentos": tudo o que foi cadastrado, na ordem em que foi gravado. v1.0 — 2026-09-27.
 *
 * O Histórico responde "quando o dinheiro entrou ou saiu"; esta tela responde "o que eu
 * registrei, e quando". Um lançamento de ontem para o mês que vem aparece aqui em cima, e lá
 * no mês que vem. Serve para conferir o que acabou de ser lançado — inclusive por importação
 * ou pelo assistente — e corrigir na hora.
 *
 * Os dias são os de **criação**, no fuso do app (`createdDay`), e a data de competência vai
 * na linha, como "para 05/10".
 */

export const metadata = { title: 'Ver lançamentos · Finanças' }
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 40

export default async function VerLancamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ antes?: string }>
}) {
  const { antes } = await searchParams
  const today = todayISO()

  const [{ items, hasMore }, expenseCategories, incomeCategories] = await Promise.all([
    listCreatedFeed({ limit: PAGE_SIZE, before: antes }),
    listActiveCategories('expense'),
    listActiveCategories('income'),
  ])

  const groups = groupByDay(items, (item) => createdDay(item.createdAt))
  const last = items.at(-1)

  return (
    <main className="mx-auto flex max-w-md flex-col gap-5 px-6 py-8">
      <header className="flex flex-col gap-2">
        <Link href="/novo" className="text-muted-foreground flex min-h-11 items-center gap-1 text-sm">
          <ChevronLeft className="size-4" aria-hidden />
          Novo lançamento
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Ver lançamentos</h1>
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
        <div className="flex flex-col gap-5">
          {groups.map((group) => (
            <section key={group.date} className="flex flex-col gap-1">
              <h2 className="text-muted-foreground px-1 text-xs font-semibold uppercase">
                {formatDayLabel(group.date, today)}
              </h2>
              <ul className="divide-border bg-card divide-y rounded-xl border">
                {group.items.map((item) => (
                  <FeedRow
                    key={`${item.type}:${item.id}`}
                    item={item}
                    expenseCategories={expenseCategories}
                    incomeCategories={incomeCategories}
                    today={today}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
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
