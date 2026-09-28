'use client'

import { Fragment, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckSquare, FileDown, Tags, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { deleteEntries } from '@/lib/actions/entries'
import type { Category } from '@/lib/db/queries/categories'
import type { FeedItem, ImportBatch } from '@/lib/db/queries/created-feed'
import type { CreditOption } from '@/lib/finance/credit'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { FeedRow } from './feed-row'
import { RecategorizeSheet } from './recategorize-sheet'

/**
 * A lista de "Ver todos", com modo seleção. v1.2 — 2026-09-27.
 *
 * v1.2: repassa os cartões e empréstimos (`creditAccounts`) até a edição de cada linha, para o
 * "Pago com" aparecer aqui como aparece no [+] e no Histórico.
 *
 * v1.1: a seleção também **categoriza** — "Categorizar" abre `RecategorizeSheet`, que aplica a
 * palavra-chave e a IA aos lançamentos marcados (e às importações inteiras), com prévia.
 *
 * "Selecionar" liga caixas de marcar nos lançamentos avulsos e importados, e uma barra no
 * topo diz quantos estão marcados e exclui todos de uma vez, com confirmação.
 *
 * Cada importação de extrato que aparece na página ganha, no modo seleção, o atalho
 * **"Selecionar importação"** logo antes da primeira linha dela. Ele marca a importação
 * INTEIRA — inclusive as linhas em outras páginas —, e o que vai para o servidor é o id da
 * importação, não a lista de ids: a página só conhece 40 linhas, e uma importação ruim pode
 * ter centenas. Desmarcar uma linha de uma importação marcada troca a marcação da
 * importação pelas linhas visíveis dela, menos a desmarcada.
 */

export interface FeedGroup {
  date: string
  label: string
  items: FeedItem[]
}

export function FeedList({
  groups,
  batches,
  expenseCategories,
  incomeCategories,
  today,
  aiAvailable,
  creditAccounts,
}: {
  groups: FeedGroup[]
  batches: ImportBatch[]
  expenseCategories: Category[]
  incomeCategories: Category[]
  today: string
  /** A IA está configurada? Sem ela, "Categorizar" oferece só a palavra-chave. */
  aiAvailable: boolean
  /** v1.2 — 2026-09-27: cartões e empréstimos (inclusive arquivados) para o "Pago com". */
  creditAccounts: CreditOption[]
}) {
  const router = useRouter()
  const [selecting, setSelecting] = useState(false)
  const [categorizing, setCategorizing] = useState(false)
  const [ids, setIds] = useState<Set<string>>(() => new Set())
  const [batchIds, setBatchIds] = useState<Set<string>>(() => new Set())
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)

  const batchById = useMemo(() => new Map(batches.map((b) => [b.id, b])), [batches])

  // Os lançamentos visíveis que podem ser marcados, e os de cada importação.
  const { selectable, visibleByBatch } = useMemo(() => {
    const selectable: { id: string; batchId: string | null }[] = []
    const visibleByBatch = new Map<string, string[]>()
    for (const group of groups) {
      for (const item of group.items) {
        if (item.type !== 'entry') continue
        selectable.push({ id: item.id, batchId: item.importBatchId })
        if (item.importBatchId) {
          const lista = visibleByBatch.get(item.importBatchId) ?? []
          lista.push(item.id)
          visibleByBatch.set(item.importBatchId, lista)
        }
      }
    }
    return { selectable, visibleByBatch }
  }, [groups])

  const count =
    ids.size + [...batchIds].reduce((total, id) => total + (batchById.get(id)?.count ?? 0), 0)

  function isChecked(id: string, batchId: string | null): boolean {
    return ids.has(id) || (batchId !== null && batchIds.has(batchId))
  }

  function toggleRow(id: string, batchId: string | null) {
    setConfirming(false)
    if (batchId && batchIds.has(batchId)) {
      // Sai a importação inteira; ficam as linhas visíveis dela, menos esta.
      const nextBatches = new Set(batchIds)
      nextBatches.delete(batchId)
      setBatchIds(nextBatches)
      const next = new Set(ids)
      for (const other of visibleByBatch.get(batchId) ?? []) if (other !== id) next.add(other)
      setIds(next)
      return
    }
    const next = new Set(ids)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setIds(next)
  }

  function toggleBatch(batchId: string) {
    setConfirming(false)
    const nextBatches = new Set(batchIds)
    const next = new Set(ids)
    if (nextBatches.has(batchId)) {
      nextBatches.delete(batchId)
    } else {
      nextBatches.add(batchId)
      // As linhas visíveis passam a ser cobertas pela importação: não contam duas vezes.
      for (const id of visibleByBatch.get(batchId) ?? []) next.delete(id)
    }
    setBatchIds(nextBatches)
    setIds(next)
  }

  function selectPage() {
    setConfirming(false)
    const next = new Set(ids)
    for (const row of selectable) {
      if (row.batchId === null || !batchIds.has(row.batchId)) next.add(row.id)
    }
    setIds(next)
  }

  function exit() {
    setSelecting(false)
    setConfirming(false)
    setIds(new Set())
    setBatchIds(new Set())
  }

  async function remove() {
    setPending(true)
    const result = await deleteEntries({ ids: [...ids], importBatchIds: [...batchIds] })
    setPending(false)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success(result.success ?? 'Lançamentos excluídos.')
    exit()
    router.refresh()
  }

  const hasSelectable = selectable.length > 0

  return (
    <div className="flex flex-col gap-5">
      {hasSelectable ? (
        <div
          className={cn(
            'bg-background/95 sticky top-0 z-10 -mx-6 flex flex-col gap-2 px-6 py-2 backdrop-blur',
            selecting && 'border-b',
          )}
        >
          {selecting ? (
            <>
              <div className="flex items-center gap-2">
                <p className="flex-1 text-sm font-medium" role="status">
                  {count === 0
                    ? 'Nada selecionado'
                    : count === 1
                      ? '1 selecionado'
                      : `${count} selecionados`}
                </p>
                <Button type="button" variant="ghost" size="sm" onClick={selectPage} className="min-h-11">
                  Marcar a página
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={exit}
                  aria-label="Sair da seleção"
                  className="size-11"
                >
                  <X className="size-4" aria-hidden />
                </Button>
              </div>

              {confirming ? (
                <div className="flex flex-col gap-2">
                  <p className="text-muted-foreground text-sm">
                    Excluir {count === 1 ? '1 lançamento' : `${count} lançamentos`}? Não dá para
                    desfazer.
                    {batchIds.size > 0
                      ? ' Importar o mesmo extrato de novo volta a trazê-los.'
                      : ''}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      onClick={() => void remove()}
                      disabled={pending}
                      className="min-h-11 flex-1 bg-[var(--expense)] text-white hover:bg-[var(--expense)]/90"
                    >
                      {pending ? 'Excluindo…' : 'Excluir'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setConfirming(false)}
                      disabled={pending}
                      className="min-h-11 flex-1"
                    >
                      Manter
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCategorizing(true)}
                    disabled={count === 0}
                    className="min-h-11 gap-2"
                  >
                    <Tags className="size-4" aria-hidden />
                    Categorizar
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setConfirming(true)}
                    disabled={count === 0}
                    className="min-h-11 gap-2"
                  >
                    <Trash2 className="size-4" aria-hidden />
                    Excluir
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelecting(true)}
                className="min-h-11 gap-2 text-[var(--brand)]"
              >
                <CheckSquare className="size-4" aria-hidden />
                Selecionar
              </Button>
            </div>
          )}
        </div>
      ) : null}

      <RecategorizeSheet
        open={categorizing}
        onOpenChange={setCategorizing}
        ids={[...ids]}
        importBatchIds={[...batchIds]}
        count={count}
        aiAvailable={aiAvailable}
        onDone={() => {
          exit()
          router.refresh()
        }}
      />

      <BatchRows
        groups={groups}
        batchById={batchById}
        selecting={selecting}
        batchIds={batchIds}
        isChecked={isChecked}
        onToggleRow={toggleRow}
        onToggleBatch={toggleBatch}
        expenseCategories={expenseCategories}
        incomeCategories={incomeCategories}
        today={today}
        creditAccounts={creditAccounts}
      />
    </div>
  )
}

/** Os grupos por dia, com o atalho de cada importação antes da primeira linha dela. */
function BatchRows({
  groups,
  batchById,
  selecting,
  batchIds,
  isChecked,
  onToggleRow,
  onToggleBatch,
  expenseCategories,
  incomeCategories,
  today,
  creditAccounts,
}: {
  groups: FeedGroup[]
  batchById: Map<string, ImportBatch>
  selecting: boolean
  batchIds: Set<string>
  isChecked: (id: string, batchId: string | null) => boolean
  onToggleRow: (id: string, batchId: string | null) => void
  onToggleBatch: (batchId: string) => void
  expenseCategories: Category[]
  incomeCategories: Category[]
  today: string
  creditAccounts: CreditOption[]
}) {
  // Uma importação só ganha o atalho uma vez na página, na primeira linha dela.
  const shown = new Set<string>()

  return (
    <>
      {groups.map((group) => (
        <section key={group.date} className="flex flex-col gap-1">
          <h2 className="text-muted-foreground px-1 text-xs font-semibold uppercase">
            {group.label}
          </h2>
          <ul className="divide-border bg-card divide-y rounded-xl border">
            {group.items.map((item) => {
              const batchId = item.type === 'entry' ? item.importBatchId : null
              const batch = batchId ? batchById.get(batchId) : undefined
              const showShortcut = selecting && batch !== undefined && !shown.has(batch.id)
              if (batch) shown.add(batch.id)

              return (
                <Fragment key={`${item.type}:${item.id}`}>
                  {showShortcut && batch ? (
                    <li className="bg-muted/40 flex items-center gap-3 px-3 py-2">
                      <FileDown className="text-muted-foreground size-4 shrink-0" aria-hidden />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-sm font-medium">Importação de extrato</span>
                        <span className="text-muted-foreground text-xs">
                          {batch.count === 1 ? '1 lançamento' : `${batch.count} lançamentos`} ·{' '}
                          {formatShort(batch.from)} a {formatShort(batch.to)}
                        </span>
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant={batchIds.has(batch.id) ? 'default' : 'outline'}
                        aria-pressed={batchIds.has(batch.id)}
                        onClick={() => onToggleBatch(batch.id)}
                        className="min-h-11 shrink-0"
                      >
                        {batchIds.has(batch.id) ? 'Desmarcar' : 'Selecionar todos'}
                      </Button>
                    </li>
                  ) : null}
                  <FeedRow
                    item={item}
                    expenseCategories={expenseCategories}
                    incomeCategories={incomeCategories}
                    today={today}
                    creditAccounts={creditAccounts}
                    selecting={selecting}
                    selection={
                      selecting && item.type === 'entry'
                        ? {
                            checked: isChecked(item.id, batchId),
                            onToggle: () => onToggleRow(item.id, batchId),
                          }
                        : undefined
                    }
                  />
                </Fragment>
              )
            })}
          </ul>
        </section>
      ))}
    </>
  )
}

/** `dd/mm` sem passar por `Date` no fuso local (invariante 2). */
function formatShort(date: string): string {
  const [, month, day] = date.split('-')
  return `${day}/${month}`
}
