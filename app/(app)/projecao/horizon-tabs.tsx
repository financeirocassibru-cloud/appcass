import Link from 'next/link'
import { cn } from '@/lib/utils'

/**
 * Horizonte da projeção.
 *
 * O estado vive na URL, não em `useState`: a escolha sobrevive a um
 * recarregamento, pode ser compartilhada, e a página continua sendo um Server
 * Component que busca só o intervalo pedido.
 *
 * Por isso também não é um Client Component — são três links, e links não
 * precisam de JavaScript.
 */
export function HorizonTabs({
  current,
  options,
}: {
  current: number
  options: readonly number[]
}) {
  return (
    <nav aria-label="Horizonte da projeção">
      <ul className="bg-muted flex gap-1 rounded-lg p-1">
        {options.map((option) => {
          const active = current === option

          return (
            <li key={option} className="flex-1">
              <Link
                href={{ pathname: '/projecao', query: { dias: String(option) } }}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'block min-h-11 rounded-md py-2.5 text-center text-sm font-semibold transition-colors',
                  active ? 'bg-card text-[var(--brand)] shadow-sm' : 'text-muted-foreground',
                )}
              >
                {option} dias
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
