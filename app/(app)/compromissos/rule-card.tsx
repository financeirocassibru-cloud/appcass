import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { RecurringRuleWithCategory } from '@/lib/db/queries/recurring'
import { expandRecurringRule } from '@/lib/finance/recurrence'
import { addDays } from '@/lib/finance/date'
import { Money } from '@/components/finance/money'
import { cn } from '@/lib/utils'

/**
 * Uma conta fixa na lista.
 *
 * O próximo vencimento sai do mesmo motor que a agenda usa
 * (`expandRecurringRule`), e não de uma conta paralela — duas fórmulas para a
 * mesma data divergiriam, e a lista diria uma coisa enquanto a agenda diz outra.
 */

const FREQUENCY_LABEL: Record<string, string> = {
  monthly: 'todo mês',
  weekly: 'toda semana',
  yearly: 'todo ano',
}

export function RuleCard({
  rule,
  today,
}: {
  rule: RecurringRuleWithCategory
  today: string
}) {
  // Uma janela de um ano à frente basta para achar a próxima ocorrência de
  // qualquer frequência, inclusive anual.
  const next = rule.isActive
    ? (expandRecurringRule(rule, today, addDays(today, 366))[0]?.date ?? null)
    : null

  return (
    <li>
      <Link
        href={{ pathname: '/compromissos/[id]', query: { id: rule.id } }}
        className={cn(
          'flex items-center gap-3 rounded-xl bg-[var(--surface)] p-4',
          !rule.isActive && 'opacity-60',
        )}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{rule.description}</p>
          <p className="text-muted-foreground truncate text-xs">
            {FREQUENCY_LABEL[rule.frequency] ?? rule.frequency}
            {rule.categoryName ? ` · ${rule.categoryName}` : ''}
            {rule.isActive
              ? next
                ? ` · vence ${formatShort(next)}`
                : ' · sem próxima ocorrência'
              : ' · desativada'}
          </p>
        </div>

        <Money cents={rule.amountCents} kind={rule.kind} className="shrink-0 text-sm" />
        <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
      </Link>
    </li>
  )
}

/** `dd/mm` a partir da string, sem passar por `Date` no fuso local. */
function formatShort(date: string): string {
  const [, month, day] = date.split('-')
  return `${day}/${month}`
}
