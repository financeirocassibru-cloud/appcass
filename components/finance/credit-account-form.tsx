'use client'

import { useActionState, useState } from 'react'
import {
  createCreditAccount,
  updateCreditAccount,
  type CreditActionState,
} from '@/lib/actions/credit'
import type { CreditAccount, CreditAccountKind } from '@/lib/finance/credit'
import { FormMessage } from '@/components/auth/form-field'
import { KeywordField } from '@/components/finance/keyword-field'
import { MoneyInput } from '@/components/finance/money-input'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/**
 * Cadastrar ou editar um cartão ou empréstimo — v1.0 — 2026-09-27 (Fase 13).
 *
 * Serve à tela `/cartoes` e ao "+ Novo cartão" do [+], que abre este formulário numa folha
 * sem sair do lançamento. Por isso o `onSaved` devolve a conta: o [+] a seleciona na hora.
 *
 * Cartão pede fechamento e vencimento — é o que decide em que fatura cada compra cai.
 * Empréstimo pede um vencimento único, um dia fixo por mês, ou nada (a data vai em cada uso).
 * Limite é opcional nos dois: sem ele, os gastos são só somados à conta.
 */
export function CreditAccountForm({
  account,
  initialKind = 'card',
  suggestions = [],
  onSaved,
}: {
  /** Editando; ausente, cadastra. O tipo não muda depois de criado. */
  account?: CreditAccount
  initialKind?: CreditAccountKind
  suggestions?: readonly string[]
  onSaved?: (account: CreditAccount) => void
}) {
  const [kind, setKind] = useState<CreditAccountKind>(account?.kind ?? initialKind)
  const [loanDue, setLoanDue] = useState<'none' | 'single' | 'monthly'>(
    account?.dueOn ? 'single' : account?.kind === 'loan' && account.dueDay ? 'monthly' : 'none',
  )
  const [hasLimit, setHasLimit] = useState(account ? account.limitCents !== null : kind === 'card')
  const [limitCents, setLimitCents] = useState(account?.limitCents ?? 0)

  const [state, formAction, pending] = useActionState(
    async (previous: CreditActionState, formData: FormData): Promise<CreditActionState> => {
      const result = account
        ? await updateCreditAccount(previous, formData)
        : await createCreditAccount(previous, formData)
      if (result.success && onSaved) {
        const day = (name: string) => {
          const raw = formData.get(name)
          return typeof raw === 'string' && raw !== '' ? Number(raw) : null
        }
        const dueOn = formData.get('dueOn')
        onSaved({
          id: account?.id ?? result.accountId ?? '',
          kind,
          name: String(formData.get('name') ?? ''),
          limitCents: hasLimit && limitCents > 0 ? limitCents : null,
          closingDay: kind === 'card' ? day('closingDay') : null,
          dueDay: day('dueDay'),
          dueOn: kind === 'loan' && typeof dueOn === 'string' && dueOn !== '' ? dueOn : null,
          keywords: account?.keywords ?? [],
          archivedAt: null,
        })
      }
      return result
    },
    {},
  )

  const isCard = kind === 'card'

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {account ? <input type="hidden" name="id" value={account.id} /> : null}
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="limitCents" value={hasLimit && limitCents > 0 ? limitCents : ''} />

      {account ? null : (
        <div role="radiogroup" aria-label="Tipo" className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1">
          {(
            [
              { value: 'card', label: 'Cartão de crédito' },
              { value: 'loan', label: 'Empréstimo' },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={kind === option.value}
              onClick={() => {
                setKind(option.value)
                setHasLimit(option.value === 'card')
              }}
              className={cn(
                'min-h-11 rounded-md text-sm font-semibold transition-colors',
                kind === option.value ? 'bg-card text-[var(--brand)] shadow-sm' : 'text-muted-foreground',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="conta-nome">Nome</Label>
        <Input
          id="conta-nome"
          name="name"
          required
          maxLength={60}
          defaultValue={account?.name}
          placeholder={isCard ? 'Nubank' : 'Empréstimo do banco'}
          className="min-h-11 text-base"
        />
      </div>

      {isCard ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="conta-fechamento">Fecha no dia</Label>
            <Input
              id="conta-fechamento"
              name="closingDay"
              type="number"
              inputMode="numeric"
              min={1}
              max={31}
              required
              defaultValue={account?.closingDay ?? ''}
              className="min-h-11 text-base"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="conta-vencimento">Vence no dia</Label>
            <Input
              id="conta-vencimento"
              name="dueDay"
              type="number"
              inputMode="numeric"
              min={1}
              max={31}
              required
              defaultValue={account?.dueDay ?? ''}
              className="min-h-11 text-base"
            />
          </div>
          <p className="text-muted-foreground col-span-2 text-xs">
            Compra até o dia do fechamento entra na fatura daquele mês; depois dele, na seguinte.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <span className="text-muted-foreground text-sm font-medium">Quando vence</span>
          <div role="radiogroup" aria-label="Vencimento" className="bg-muted grid grid-cols-3 gap-1 rounded-lg p-1">
            {(
              [
                { value: 'single', label: 'Data única' },
                { value: 'monthly', label: 'Todo mês' },
                { value: 'none', label: 'A cada uso' },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={loanDue === option.value}
                onClick={() => setLoanDue(option.value)}
                className={cn(
                  'min-h-11 rounded-md text-xs font-semibold transition-colors',
                  loanDue === option.value ? 'bg-card text-[var(--brand)] shadow-sm' : 'text-muted-foreground',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          {loanDue === 'single' ? (
            <Input
              name="dueOn"
              type="date"
              required
              aria-label="Data do vencimento"
              defaultValue={account?.dueOn ?? ''}
              className="min-h-11 text-base"
            />
          ) : null}
          {loanDue === 'monthly' ? (
            <Input
              name="dueDay"
              type="number"
              inputMode="numeric"
              min={1}
              max={31}
              required
              aria-label="Dia do vencimento"
              placeholder="Dia"
              defaultValue={account?.dueDay ?? ''}
              className="min-h-11 w-28 text-base"
            />
          ) : null}
          <p className="text-muted-foreground text-xs">
            {loanDue === 'single'
              ? 'Tudo o que for tomado aqui vence nesta data — em uma vez ou em parcelas mensais a partir dela.'
              : loanDue === 'monthly'
                ? 'As parcelas vencem neste dia, mês a mês.'
                : 'A data de pagamento é escolhida em cada lançamento.'}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-xl bg-[var(--surface)] p-4">
        <label className="flex min-h-11 items-center gap-3">
          <input
            type="checkbox"
            checked={hasLimit}
            onChange={(event) => setHasLimit(event.target.checked)}
            className="accent-primary size-5"
          />
          <span className="text-sm">{isCard ? 'Tem limite' : 'Tem um valor máximo (limite)'}</span>
        </label>
        {hasLimit ? (
          <MoneyInput
            name={null}
            label="Limite"
            compact
            initialCents={account?.limitCents ?? undefined}
            onCentsChange={setLimitCents}
          />
        ) : (
          <p className="text-muted-foreground text-xs">
            Sem limite, os gastos são só somados a {isCard ? 'este cartão' : 'este empréstimo'}.
          </p>
        )}
      </div>

      <KeywordField
        label="Palavras-chave do extrato (opcional)"
        hint={`A linha do extrato com uma destas palavras paga ${isCard ? 'a fatura' : 'a parcela'} na importação — por exemplo, "pagamento fatura" ou o nome do banco.`}
        initial={account?.keywords}
        suggestions={suggestions}
      />

      <FormMessage error={state.error} success={onSaved ? undefined : state.success} />

      <Button type="submit" disabled={pending} className="min-h-12 text-base">
        {pending ? 'Salvando…' : account ? 'Salvar' : isCard ? 'Cadastrar cartão' : 'Cadastrar empréstimo'}
      </Button>
    </form>
  )
}
