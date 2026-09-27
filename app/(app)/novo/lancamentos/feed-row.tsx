'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import type { Category } from '@/lib/db/queries/categories'
import type { FeedItem } from '@/lib/db/queries/created-feed'
import { createdTime } from '@/lib/feed'
import { EntryForm } from '@/components/finance/entry-form'
import { Money } from '@/components/finance/money'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

/**
 * Uma linha de "Ver todos". v1.1 — 2026-09-27.
 *
 * v1.1: modo seleção. Com `selection`, o lançamento avulso vira uma caixa de marcar em vez
 * de abrir a edição, e regra e parcelamento ficam apagados — eles têm a exclusão deles, na
 * tela deles. O importado ganha o selo "importada", para a importação ruim se achar de
 * relance.
 *
 * O selo diz o que foi cadastrado; a hora é a da criação; a data ao lado é a de competência.
 * Tocar abre a edição — o lançamento avulso num painel, como no Histórico, e a regra ou o
 * parcelamento na tela deles, que é onde se mexe neles.
 */

const FREQUENCY: Record<string, string> = { monthly: 'mensal', weekly: 'semanal', yearly: 'anual' }

export interface RowSelection {
  checked: boolean
  onToggle: () => void
}

export function FeedRow({
  item,
  expenseCategories,
  incomeCategories,
  today,
  selecting = false,
  selection,
}: {
  item: FeedItem
  expenseCategories: Category[]
  incomeCategories: Category[]
  today: string
  /** A lista está em modo seleção. */
  selecting?: boolean
  /** Presente só para linha que pode ser marcada (lançamento avulso ou importado). */
  selection?: RowSelection | undefined
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const time = createdTime(item.createdAt)

  if (selecting && !selection && item.type !== 'entry') {
    // Regra e parcelamento: visíveis, para a ordem da lista não pular, mas fora do alcance.
    return (
      <li className="flex min-h-11 items-center gap-3 px-3 py-2.5 opacity-50">
        <span className="size-5 shrink-0" aria-hidden />
        <Content
          badge={item.type === 'installment' ? 'Parcelado' : item.kind === 'income' ? 'Renda fixa' : 'Conta fixa'}
          title={item.description}
          detail="Exclua na tela do cadastro"
        />
      </li>
    )
  }

  if (item.type === 'entry') {
    const { entry } = item
    const imported = item.importBatchId !== null
    const badge =
      entry.kind === 'expense'
        ? imported
          ? 'Saída importada'
          : 'Saída avulsa'
        : imported
          ? 'Entrada importada'
          : 'Entrada avulsa'
    const detail = `${time} · para ${formatShort(entry.occurredOn)}${entry.category ? ` · ${entry.category.name}` : ''}${entry.isSettled ? '' : ' · pendente'}`

    if (selection) {
      return (
        <li>
          <label className="flex min-h-11 w-full cursor-pointer items-center gap-3 px-3 py-2.5">
            <input
              type="checkbox"
              checked={selection.checked}
              onChange={selection.onToggle}
              className="size-5 shrink-0 accent-[var(--brand)]"
            />
            <Content badge={badge} title={entry.description} detail={detail} />
            <Money cents={entry.amountCents} kind={entry.kind} className="shrink-0 text-sm" />
          </label>
        </li>
      )
    }

    return (
      <li>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex min-h-11 w-full items-center gap-3 px-3 py-2.5 text-left"
        >
          <Content badge={badge} title={entry.description} detail={detail} />
          <Money
            cents={entry.amountCents}
            kind={entry.kind}
            className={cn('shrink-0 text-sm', entry.isSettled ? '' : 'opacity-70')}
          />
        </button>

        <Sheet open={editing} onOpenChange={setEditing}>
          <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto px-6 pt-6 pb-8">
            <SheetHeader className="px-0">
              <SheetTitle>Editar lançamento</SheetTitle>
              <SheetDescription>Altere o que precisar, ou exclua no fim do formulário.</SheetDescription>
            </SheetHeader>
            <EntryForm
              key={entry.id}
              mode="edit"
              entry={entry}
              expenseCategories={expenseCategories}
              incomeCategories={incomeCategories}
              today={today}
              onDone={(result) => {
                toast.success(result === 'deleted' ? 'Lançamento excluído.' : 'Lançamento atualizado.')
                setEditing(false)
                router.refresh()
              }}
            />
          </SheetContent>
        </Sheet>
      </li>
    )
  }

  if (item.type === 'recurring') {
    const isIncome = item.kind === 'income'
    return (
      <li>
        <Link
          href={
            isIncome
              ? { pathname: '/rendas/[id]', query: { id: item.id } }
              : { pathname: '/compromissos/[id]', query: { id: item.id } }
          }
          className={cn('flex min-h-11 items-center gap-3 px-3 py-2.5', !item.isActive && 'opacity-60')}
        >
          <Content
            badge={isIncome ? 'Renda fixa' : 'Conta fixa'}
            title={item.description}
            detail={`${time} · ${FREQUENCY[item.frequency] ?? item.frequency}, desde ${formatShort(item.startsOn)}${item.isActive ? '' : ' · desativada'}`}
          />
          <Money cents={item.amountCents} kind={item.kind} className="shrink-0 text-sm" />
          <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
        </Link>
      </li>
    )
  }

  return (
    <li>
      <Link
        href={{ pathname: '/parcelas/[id]', query: { id: item.id } }}
        className="flex min-h-11 items-center gap-3 px-3 py-2.5"
      >
        <Content
          badge="Parcelado"
          title={item.description}
          detail={`${time} · ${item.installmentsCount}x, a partir de ${formatShort(item.firstDueOn)}`}
        />
        <Money cents={item.totalAmountCents} kind="expense" className="shrink-0 text-sm" />
        <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
      </Link>
    </li>
  )
}

function Content({ badge, title, detail }: { badge: string; title: string; detail: string }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="text-muted-foreground text-[11px] font-semibold uppercase">{badge}</span>
      <span className="block truncate text-sm font-medium">{title}</span>
      <span className="text-muted-foreground block truncate text-xs">{detail}</span>
    </span>
  )
}

/** `dd/mm/aa` sem passar por `Date` no fuso local. */
function formatShort(date: string): string {
  const [year, month, day] = date.split('-')
  return `${day}/${month}/${year?.slice(2)}`
}
