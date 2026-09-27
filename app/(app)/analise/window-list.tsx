'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { Category } from '@/lib/db/queries/categories'
import type { EntryWithCategory } from '@/lib/db/queries/entries'
import { bucketize } from '@/lib/finance/buckets'
import { formatDayLabel } from '@/lib/finance/grouping'
import { formatCents } from '@/lib/finance/money'
import type { DayProjection, Occurrence } from '@/lib/finance/types'
import { EntryForm } from '@/components/finance/entry-form'
import { OccurrenceRow, entryIdOf } from '@/components/finance/charts/period-panel'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

/**
 * A janela da Análise em lista, no formato do Histórico.
 *
 * v1.0 — 2026-09-27. O gráfico responde "como vai ser"; esta lista responde "o que exatamente",
 * e é ela o caminho acessível aos mesmos números — o gráfico é `aria-hidden` justamente porque
 * esta lista existe.
 *
 * Diferente do Histórico, aqui aparecem também as ocorrências **previstas** que ainda não são
 * lançamento: conta fixa que vai vencer, aporte de meta, item hipotético de cenário. Só as que
 * têm linha em `entries` abrem para edição, porque só essas existem para atualizar.
 */
export function WindowList({
  days,
  today,
  entriesById,
  expenseCategories,
  incomeCategories,
  renderActions,
}: {
  days: DayProjection[]
  today: string
  entriesById: Record<string, EntryWithCategory>
  expenseCategories: Category[]
  incomeCategories: Category[]
  renderActions?: (occurrence: Occurrence) => React.ReactNode
}) {
  const router = useRouter()
  const [editingId, setEditingId] = useState<string | null>(null)
  const editing = editingId ? entriesById[editingId] : undefined

  // Só os dias com movimento: numa janela de 120 dias, 90 vazios não são um fluxo, são um rolo.
  // A continuidade já está no gráfico.
  const groups = useMemo(
    () => bucketize(days, 'day', today).filter((point) => point.occurrences.length > 0),
    [days, today],
  )

  if (groups.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        Nenhum lançamento neste período.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <section key={group.key} className="flex flex-col gap-1">
          <h3 className="text-muted-foreground flex items-baseline justify-between gap-3 px-1 text-xs font-semibold uppercase">
            <span>{formatDayLabel(group.from, today)}</span>
            <span className="tabular font-normal normal-case">
              saldo{' '}
              <span
                className={
                  group.closingBalanceCents < 0
                    ? 'font-semibold text-[var(--expense)]'
                    : 'text-foreground font-semibold'
                }
              >
                {formatCents(group.closingBalanceCents)}
              </span>
            </span>
          </h3>

          <ul className="divide-border bg-card divide-y rounded-xl border px-3">
            {group.occurrences.map((occurrence) => {
              const id = entryIdOf(occurrence)
              return (
                <OccurrenceRow
                  key={occurrence.key}
                  occurrence={occurrence}
                  today={today}
                  showDate={false}
                  editable={Boolean(id && entriesById[id])}
                  onEdit={() => setEditingId(id)}
                  actions={renderActions?.(occurrence)}
                />
              )
            })}
          </ul>
        </section>
      ))}

      <Sheet open={Boolean(editing)} onOpenChange={(open) => !open && setEditingId(null)}>
        <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto px-6 pt-6 pb-8">
          <SheetHeader className="px-0">
            <SheetTitle>Editar lançamento</SheetTitle>
            <SheetDescription>
              Altere o que precisar, ou exclua no fim do formulário.
            </SheetDescription>
          </SheetHeader>

          {editing ? (
            <EntryForm
              key={editing.id}
              mode="edit"
              entry={editing}
              expenseCategories={expenseCategories}
              incomeCategories={incomeCategories}
              today={today}
              onDone={(result) => {
                toast.success(
                  result === 'deleted' ? 'Lançamento excluído.' : 'Lançamento atualizado.',
                )
                setEditingId(null)
                router.refresh()
              }}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}
