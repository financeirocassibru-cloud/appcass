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
 * Uma linha de "Ver lançamentos". v1.0 — 2026-09-27.
 *
 * O selo diz o que foi cadastrado; a hora é a da criação; a data ao lado é a de competência.
 * Tocar abre a edição — o lançamento avulso num painel, como no Histórico, e a regra ou o
 * parcelamento na tela deles, que é onde se mexe neles.
 */

const FREQUENCY: Record<string, string> = { monthly: 'mensal', weekly: 'semanal', yearly: 'anual' }

export function FeedRow({
  item,
  expenseCategories,
  incomeCategories,
  today,
}: {
  item: FeedItem
  expenseCategories: Category[]
  incomeCategories: Category[]
  today: string
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const time = createdTime(item.createdAt)

  if (item.type === 'entry') {
    const { entry } = item
    return (
      <li>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex min-h-11 w-full items-center gap-3 px-3 py-2.5 text-left"
        >
          <Content
            badge={entry.kind === 'expense' ? 'Saída avulsa' : 'Entrada avulsa'}
            title={entry.description}
            detail={`${time} · para ${formatShort(entry.occurredOn)}${entry.category ? ` · ${entry.category.name}` : ''}${entry.isSettled ? '' : ' · pendente'}`}
          />
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
