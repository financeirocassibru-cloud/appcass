import { getBalanceAnchor, getCurrentBalance } from '@/lib/db/queries/balance'
import { listActiveCategories } from '@/lib/db/queries/categories'
import { todayISO } from '@/lib/finance/date'
import { Balance } from '@/components/finance/money'
import { BalanceAnchorForm } from './form'

// v1.1 — 27/09/2026: só o nome da tela; o "· Cass" vem do `template` do layout raiz.
// v1.2 — 02/10/2026: o ajuste vira lançamento (com nome e categoria) ou "Zerar"; a página
// passa o saldo calculado e as categorias para o formulário.
export const metadata = { title: 'Saldo' }
/** Lê "hoje" e o saldo do banco: prerenderizar congelaria os dois no build. */
export const dynamic = 'force-dynamic'

export default async function SaldoPage() {
  const today = todayISO()
  const [anchor, balance, expenseCategories, incomeCategories] = await Promise.all([
    getBalanceAnchor(),
    getCurrentBalance(today),
    listActiveCategories('expense'),
    listActiveCategories('income'),
  ])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Ajustar saldo</h2>
        <p className="text-sm text-[var(--foreground-muted)]">
          Informe quanto você tem hoje. A diferença para o saldo calculado entra no histórico
          como um lançamento — saída se tem menos, entrada se tem mais. Se preferir recomeçar
          sem explicar a diferença, use “Zerar”.
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
        currentCents={balance.currentCents}
        isConfigured={anchor.isConfigured}
        initialDate={anchor.openingBalanceOn}
        today={today}
        expenseCategories={expenseCategories}
        incomeCategories={incomeCategories}
      />

      <p className="text-xs text-[var(--foreground-muted)]">
        Só lançamentos marcados como pagos ou recebidos entram no saldo. O que está pendente
        aparece na agenda do Início, não aqui — ainda não saiu da conta.
      </p>
    </div>
  )
}
