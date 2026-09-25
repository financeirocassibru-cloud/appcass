import { todayISO } from '@/lib/finance/date'

/**
 * `force-dynamic` porque a página mostra a data de hoje: prerenderizada, ela
 * congelaria o dia do build. A fase 3b vai ler saldo e agenda do banco, e
 * precisaria disto de qualquer forma.
 */
export const dynamic = 'force-dynamic'

export default function InicioPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-6 py-8">
      <h1 className="text-2xl font-bold tracking-tight">Início</h1>
      <p className="text-muted-foreground text-sm">
        O herói de saldo, a agenda de próximos eventos e os gráficos entram na fase 3b — ver{' '}
        <code className="bg-muted rounded px-1.5 py-0.5 text-xs">docs/ROADMAP.md</code>.
      </p>
      <p className="text-muted-foreground text-xs">
        Hoje é {todayISO()} no fuso de São Paulo.
      </p>
    </main>
  )
}
