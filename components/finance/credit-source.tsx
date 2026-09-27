'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CreditCard, Landmark } from 'lucide-react'
import { defaultFirstDue, type CreditAccountKind, type CreditOption } from '@/lib/finance/credit'
import { isISODate } from '@/lib/finance/date'
import { formatCents } from '@/lib/finance/money'
import { CreditAccountForm } from '@/components/finance/credit-account-form'
import { MoneyInput } from '@/components/finance/money-input'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

/**
 * "Pago com" — v1.0 — 2026-09-27 (Fase 13).
 *
 * O seletor que diz de onde veio o dinheiro: do saldo (o padrão, e o caminho de sempre), de
 * um cartão ou de um empréstimo. Escolhida uma conta, a data do lançamento continua sendo a
 * do GASTO — é por ela que a categoria conta — e aparecem os campos da dívida:
 *
 * - **Será pago em**: o vencimento sugerido pelo ciclo da conta (`defaultFirstDue`, a mesma
 *   regra do banco), que a pessoa pode trocar. Enquanto não troca, acompanha a data do gasto.
 * - **Valor a pagar**: por padrão o mesmo valor; com juros, o que vai ser pago de fato.
 * - **Em quantas vezes** (só empréstimo, só no lançamento avulso): as parcelas mensais.
 *
 * O cartão ou empréstimo que ainda não existe é cadastrado ali mesmo, numa folha, sem perder
 * o que já foi digitado.
 *
 * Os campos vão como `input hidden` com os nomes de `creditFieldsShape`
 * (lib/validation/credit.ts). Sem conta escolhida, `creditAccountId` vai vazio — "do saldo" —
 * e a action grava o lançamento como sempre.
 */
export function CreditSourceField({
  accounts,
  kind,
  occurredOn,
  amountCents,
  value,
  onChange,
  initialFirstDue = null,
  initialCount = 1,
  initialTotalCents = null,
  allowLoan = true,
  allowCount = true,
  detail = true,
  suggestions = [],
}: {
  accounts: readonly CreditOption[]
  kind: 'expense' | 'income'
  /** A data do gasto (ou do recebimento). */
  occurredOn: string
  amountCents: number
  /** O id da conta escolhida; `''` é o saldo. */
  value: string
  onChange: (accountId: string) => void
  initialFirstDue?: string | null
  initialCount?: number
  initialTotalCents?: number | null
  /** Conta fixa e parcelamento só vão para cartão. */
  allowLoan?: boolean
  /** "Em quantas vezes" (dívida parcelada) — só no lançamento avulso. */
  allowCount?: boolean
  /**
   * `false` na conta fixa e no parcelamento: cada ocorrência/parcela cai na fatura do mês em
   * que acontece, calculada pelo banco — não há "será pago em" nem juros a informar.
   */
  detail?: boolean
  suggestions?: readonly string[]
}) {
  const router = useRouter()
  const [created, setCreated] = useState<CreditOption[]>([])
  const [creating, setCreating] = useState<CreditAccountKind | null>(null)
  /** A data que a pessoa escolheu; `null` = seguir a sugestão. */
  const [dueOverride, setDueOverride] = useState<string | null>(initialFirstDue)
  const [count, setCount] = useState(initialCount)
  const [withInterest, setWithInterest] = useState(initialTotalCents !== null)
  const [totalCents, setTotalCents] = useState(initialTotalCents ?? 0)

  const all = [...accounts, ...created.filter((c) => !accounts.some((a) => a.id === c.id))].filter(
    (a) => (allowLoan || a.kind === 'card') && (a.archivedAt === null || a.id === value),
  )
  const selected = all.find((a) => a.id === value) ?? null
  const suggested = selected && isISODate(occurredOn) ? defaultFirstDue(selected, occurredOn) : null
  const firstDue = dueOverride ?? suggested ?? ''
  const showCount = allowCount && selected?.kind === 'loan'
  const payCents = withInterest ? totalCents : amountCents
  const overLimit =
    selected && selected.availableCents !== null && kind === 'expense' && payCents > selected.availableCents

  function choose(id: string) {
    onChange(id)
    setDueOverride(null)
    if (id === '') {
      setCount(1)
      setWithInterest(false)
    }
  }

  const sourceLabel = kind === 'expense' ? 'Pago com' : 'Veio de'

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="creditAccountId" value={selected ? selected.id : ''} />
      <input type="hidden" name="chargeFirstDueOn" value={selected ? firstDue : ''} />
      <input type="hidden" name="chargeCount" value={selected && showCount ? count : 1} />
      <input
        type="hidden"
        name="chargeTotalCents"
        value={selected && withInterest && totalCents > 0 ? totalCents : ''}
      />

      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-sm font-medium">{sourceLabel}</span>
        <div role="radiogroup" aria-label={sourceLabel} className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-1">
          <Chip checked={selected === null} onClick={() => choose('')}>
            Saldo
          </Chip>
          {all.map((account) => (
            <Chip key={account.id} checked={value === account.id} onClick={() => choose(account.id)}>
              {account.kind === 'card' ? (
                <CreditCard className="size-4" aria-hidden />
              ) : (
                <Landmark className="size-4" aria-hidden />
              )}
              {account.name}
            </Chip>
          ))}
          <button
            type="button"
            onClick={() => setCreating('card')}
            className="border-input text-muted-foreground min-h-11 shrink-0 rounded-full border border-dashed px-4 text-sm"
          >
            + Cartão
          </button>
          {allowLoan ? (
            <button
              type="button"
              onClick={() => setCreating('loan')}
              className="border-input text-muted-foreground min-h-11 shrink-0 rounded-full border border-dashed px-4 text-sm"
            >
              + Empréstimo
            </button>
          ) : null}
        </div>
      </div>

      {selected && !detail ? (
        <p className="text-muted-foreground text-xs">
          Cada {allowCount ? 'cobrança' : 'parcela ou ocorrência'} entra na fatura do mês em que
          acontece, conta na categoria na própria data e sai do saldo quando a fatura for paga.
        </p>
      ) : null}

      {selected && detail ? (
        <div className="flex flex-col gap-4 rounded-xl bg-[var(--surface)] p-4">
          <p className="text-muted-foreground text-xs">
            {kind === 'expense'
              ? `Conta na categoria na data do gasto, e sai do saldo só quando ${
                  selected.kind === 'card' ? 'a fatura' : 'o empréstimo'
                } for pago.`
              : `Entra no saldo agora, e o pagamento ${
                  selected.kind === 'card' ? 'vai para a fatura' : 'do empréstimo'
                } sai do saldo no vencimento.`}
            {selected.availableCents !== null
              ? ` Disponível: ${formatCents(selected.availableCents)}.`
              : ''}
          </p>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="credito-vencimento">
              {showCount && count > 1 ? 'Primeira parcela vence em' : 'Será pago em'}
            </Label>
            <Input
              id="credito-vencimento"
              type="date"
              required
              value={firstDue}
              onChange={(event) => setDueOverride(event.target.value)}
              className="min-h-11 text-base"
            />
            {selected.kind === 'card' && suggested && firstDue === suggested ? (
              <p className="text-muted-foreground text-xs">A fatura em que este gasto cai.</p>
            ) : null}
          </div>

          {showCount ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="credito-vezes">Em quantas vezes</Label>
              <Input
                id="credito-vezes"
                type="number"
                min={1}
                max={360}
                inputMode="numeric"
                value={count}
                onChange={(event) => setCount(Math.max(1, Math.min(360, Number(event.target.value) || 1)))}
                className="min-h-11 w-28 text-base"
              />
              <p className="text-muted-foreground text-xs">1 é à vista. Mais que isso, uma parcela por mês.</p>
            </div>
          ) : null}

          <label className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              checked={withInterest}
              onChange={(event) => {
                setWithInterest(event.target.checked)
                if (event.target.checked && totalCents < amountCents) setTotalCents(amountCents)
              }}
              className="accent-primary size-5"
            />
            <span className="text-sm">Tem juros — o valor a pagar é outro</span>
          </label>
          {withInterest ? (
            <div className="flex flex-col gap-1">
              <MoneyInput
                key={`total-${amountCents > 0 ? 'com' : 'sem'}`}
                name={null}
                compact
                label={showCount && count > 1 ? 'Total a pagar (todas as parcelas)' : 'Valor a pagar'}
                initialCents={totalCents || amountCents || undefined}
                onCentsChange={setTotalCents}
              />
              <p className="text-muted-foreground text-xs">
                {totalCents > amountCents
                  ? `${formatCents(totalCents - amountCents)} de juros, em "Juros e encargos".`
                  : 'Informe o total que será pago, com os juros.'}
                {showCount && count > 1 && totalCents > 0
                  ? ` ${count}× de cerca de ${formatCents(Math.round(totalCents / count))}.`
                  : ''}
              </p>
            </div>
          ) : null}

          {overLimit ? (
            <p className="text-sm text-[var(--expense)]" role="status">
              Passa do limite disponível em {formatCents(payCents - (selected.availableCents ?? 0))}. Dá para
              salvar mesmo assim.
            </p>
          ) : null}
        </div>
      ) : null}

      <Sheet open={creating !== null} onOpenChange={(open) => (open ? null : setCreating(null))}>
        <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto px-6 pt-6 pb-8">
          <SheetHeader className="px-0">
            <SheetTitle>{creating === 'loan' ? 'Novo empréstimo' : 'Novo cartão'}</SheetTitle>
            <SheetDescription>Cadastre e ele já fica escolhido neste lançamento.</SheetDescription>
          </SheetHeader>
          {creating ? (
            <CreditAccountForm
              key={creating}
              initialKind={creating}
              suggestions={suggestions}
              onSaved={(account) => {
                setCreated((list) => [...list, { ...account, availableCents: account.limitCents }])
                onChange(account.id)
                setDueOverride(null)
                setCreating(null)
                router.refresh()
              }}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function Chip({
  checked,
  onClick,
  children,
}: {
  checked: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onClick}
      className={cn(
        'flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors',
        checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card text-foreground',
      )}
    >
      {children}
    </button>
  )
}
