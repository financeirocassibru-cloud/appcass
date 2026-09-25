import { getBalanceAnchor, getCurrentBalance } from '@/lib/db/queries/balance'
import { todayISO } from '@/lib/finance/date'
import { Balance } from '@/components/finance/money'
import { BalanceAnchorForm } from './form'

export const metadata = { title: 'Saldo · Finanças' }
/** Lê "hoje" e o saldo do banco: prerenderizar congelaria os dois no build. */
export const dynamic = 'force-dynamic'

export default async function SaldoPage() {
  const today = todayISO()
  const [anchor, balance] = await Promise.all([getBalanceAnchor(), getCurrentBalance(today)])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Ajustar saldo</h2>
        <p className="text-sm text-[var(--foreground-muted)]">
          Informe quanto você tem hoje. O app não adivinha esse número: ele parte daqui e soma o
          que você já pagou e recebeu desde essa data.
        </p>
      </div>

      <div className="rounded-xl bg-[var(--surface)] p-4">
        <p className="text-xs text-[var(--foreground-muted)]">Saldo calculado agora</p>
        <Balance cents={balance.currentCents} className="text-2xl" />
        <p className="mt-2 text-xs text-[var(--foreground-muted)]">
          {balance.countedEntries === 0
            ? 'Nenhum lançamento liquidado desde a data do saldo.'
            : `${balance.countedEntries} ${
                balance.countedEntries === 1 ? 'lançamento liquidado' : 'lançamentos liquidados'
              } desde a data do saldo.`}
        </p>
      </div>

      <BalanceAnchorForm
        initialCents={Math.abs(anchor.openingBalanceCents)}
        initialIsNegative={anchor.openingBalanceCents < 0}
        initialDate={anchor.openingBalanceOn}
        today={today}
      />

      <p className="text-xs text-[var(--foreground-muted)]">
        Só lançamentos marcados como pagos ou recebidos entram no saldo. O que está pendente
        aparece na agenda do Início, não aqui — ainda não saiu da conta.
      </p>
    </div>
  )
}
