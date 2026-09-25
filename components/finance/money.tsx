import { formatCents } from '@/lib/finance/money'
import { cn } from '@/lib/utils'

/**
 * Valor monetário com sinal e cor semântica.
 *
 * Verde e vermelho aqui significam entrada e saída de dinheiro, e só isso —
 * a regra de `docs/DESIGN.md`. `tabular` alinha os dígitos numa coluna.
 */
export function Money({
  cents,
  kind,
  className,
  withSign = true,
}: {
  cents: number
  kind: 'income' | 'expense'
  className?: string
  withSign?: boolean
}) {
  const sign = kind === 'income' ? '+' : '−'

  return (
    <span
      className={cn(
        'tabular font-semibold',
        kind === 'income' ? 'text-[var(--income)]' : 'text-[var(--expense)]',
        className,
      )}
    >
      {withSign ? `${sign} ` : ''}
      {formatCents(cents)}
    </span>
  )
}

/** Saldo, cuja cor depende do sinal e não de um tipo declarado. */
export function Balance({ cents, className }: { cents: number; className?: string }) {
  return (
    <span
      className={cn(
        'tabular font-bold',
        cents < 0 ? 'text-[var(--expense)]' : 'text-[var(--income)]',
        className,
      )}
    >
      {formatCents(cents)}
    </span>
  )
}
