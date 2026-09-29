'use client'

import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { updateRecurring, type RecurringActionState } from '@/lib/actions/recurring'
import type { Category } from '@/lib/db/queries/categories'
import type { RecurrenceFrequency, RecurringRule } from '@/lib/finance/types'
import { KeywordField } from '@/components/finance/keyword-field'
import { MoneyInput } from '@/components/finance/money-input'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FormMessage } from '@/components/auth/form-field'
import { cn } from '@/lib/utils'

const initialState: RecurringActionState = {}

const FREQUENCIES: { value: RecurrenceFrequency; label: string }[] = [
  { value: 'monthly', label: 'Mensal' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'yearly', label: 'Anual' },
]

/**
 * Formulário de edição de conta fixa ou renda fixa.
 *
 * v1.1 — 2026-09-27: só edita. Criar passou para o [+] (`components/finance/launch-form.tsx`),
 * e o tipo deixou de ser trocável aqui: conta fixa e renda fixa são listas separadas, e virar
 * o salário em despesa por um toque errado no meio da edição não é uma operação que alguém
 * queira. Quem errou o tipo exclui e cadastra de novo.
 *
 * v1.2 — 2026-09-27: palavras-chave do extrato (migration 0019) — a linha importada que
 * contém uma delas marca a ocorrência do mês como paga/recebida, com o valor do extrato.
 *
 * v1.4 — 28/09/2026 (Fase 14): `onDone`, para a planilha editar numa janela sem sair dela.
 *
 * v1.3 — 2026-09-27 (Fase 13): "Pago no cartão", só na conta fixa. A ocorrência deixa de sair
 * do saldo e entra na fatura do cartão; vira lançamento quando a fatura é paga.
 *
 * O dia do vencimento só aparece quando a frequência é mensal — numa semanal ou
 * anual o vencimento sai da data de início, e um campo que não governa nada só
 * confunde. A validação no servidor recusa a combinação de qualquer forma.
 */
export function RecurringForm({
  categories,
  rule,
  suggestions = [],
  cards = [],
  onDone,
}: {
  /** As categorias do tipo da regra. */
  categories: Category[]
  rule: RecurringRule & { keywords: string[] }
  /** Descrições já importadas do mesmo tipo, para sugerir palavra-chave. */
  suggestions?: string[]
  /** v1.3 — 2026-09-27: cartões ativos, para "Pago no cartão". */
  cards?: { id: string; name: string }[]
  /** v1.4 — 28/09/2026: chamado depois de salvar, no lugar de ir para a lista (planilha). */
  onDone?: () => void
}) {
  const router = useRouter()
  const kind = rule.kind

  const [categoryId, setCategoryId] = useState<string>(rule.categoryId ?? '')
  const [frequency, setFrequency] = useState<RecurrenceFrequency>(rule.frequency)

  const [state, formAction, pending] = useActionState(
    async (prev: RecurringActionState, formData: FormData) => {
      const result = await updateRecurring(prev, formData)
      if (result.success) {
        toast.success(kind === 'income' ? 'Renda fixa atualizada.' : result.success)
        if (onDone) onDone()
        else router.push(kind === 'income' ? '/rendas' : '/compromissos')
      }
      return result
    },
    initialState,
  )

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="id" value={rule.id} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="categoryId" value={categoryId} />
      <input type="hidden" name="frequency" value={frequency} />

      <MoneyInput
        label="Valor de cada ocorrência"
        initialCents={rule.amountCents}
      />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="campo-descricao">Descrição</Label>
        <Input
          id="campo-descricao"
          name="description"
          required
          maxLength={120}
          defaultValue={rule.description}
          placeholder={kind === 'expense' ? 'Aluguel' : 'Salário'}
          className="min-h-11 text-base"
        />
      </div>

      {categories.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span className="text-muted-foreground text-sm font-medium">Categoria</span>
          <div className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-1">
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                aria-pressed={categoryId === category.id}
                onClick={() => setCategoryId(categoryId === category.id ? '' : category.id)}
                className={cn(
                  'min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors',
                  categoryId === category.id
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-input bg-card text-foreground',
                )}
              >
                {category.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-sm font-medium">Repete</span>
        <div role="radiogroup" aria-label="Frequência" className="bg-muted grid grid-cols-3 gap-1 rounded-lg p-1">
          {FREQUENCIES.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={frequency === option.value}
              onClick={() => setFrequency(option.value)}
              className={cn(
                'min-h-11 rounded-md text-sm font-semibold transition-colors',
                frequency === option.value
                  ? 'bg-card text-[var(--brand)] shadow-sm'
                  : 'text-muted-foreground',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {frequency === 'monthly' ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="campo-dia">Dia do vencimento</Label>
          <Input
            id="campo-dia"
            name="dayOfMonth"
            type="number"
            min={1}
            max={31}
            inputMode="numeric"
            defaultValue={rule.dayOfMonth ?? ''}
            placeholder="10"
            className="min-h-11 text-base"
          />
          <p className="text-muted-foreground text-xs">
            Dia 31 cai no dia 28 em fevereiro — a conta nunca some do mês.
          </p>
        </div>
      ) : (
        // O campo precisa existir no FormData mesmo oculto: o schema espera a
        // chave, e ausência viraria `undefined` em vez de "sem dia".
        <input type="hidden" name="dayOfMonth" value="" />
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="campo-inicio">Começa em</Label>
        <Input
          id="campo-inicio"
          name="startsOn"
          type="date"
          required
          defaultValue={rule.startsOn}
          className="min-h-11 text-base"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="campo-fim">Termina em (opcional)</Label>
        <Input
          id="campo-fim"
          name="endsOn"
          type="date"
          defaultValue={rule.endsOn ?? ''}
          className="min-h-11 text-base"
        />
        <p className="text-muted-foreground text-xs">
          Deixe vazio para uma conta sem prazo de fim.
        </p>
      </div>

      <p className="text-muted-foreground bg-muted rounded-lg p-3 text-xs">
        Mudar o valor vale da próxima ocorrência em diante. O que você já marcou como{' '}
        {kind === 'income' ? 'recebido' : 'pago'} fica como está — é histórico, e mexer nele
        mudaria o saldo de meses fechados.
      </p>

      {kind === 'expense' && (cards.length > 0 || rule.creditAccountId) ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="campo-cartao">Pago no cartão</Label>
          <select
            id="campo-cartao"
            name="creditAccountId"
            defaultValue={rule.creditAccountId ?? ''}
            className="border-input bg-card min-h-11 rounded-md border px-3 text-base"
          >
            <option value="">Não — sai do saldo no vencimento</option>
            {cards.map((card) => (
              <option key={card.id} value={card.id}>
                {card.name}
              </option>
            ))}
          </select>
          <p className="text-muted-foreground text-xs">
            No cartão, cada ocorrência entra na fatura do mês dela e sai do saldo com a fatura.
          </p>
        </div>
      ) : null}

      <KeywordField
        label="Palavras-chave do extrato"
        hint={`Na importação, a linha do extrato com uma destas palavras marca a ocorrência do mês como ${kind === 'income' ? 'recebida' : 'paga'}, com o valor do extrato. Ex.: o nome de quem ${kind === 'income' ? 'paga' : 'cobra'}.`}
        initial={rule.keywords}
        suggestions={suggestions}
      />

      <FormMessage error={state.error} />

      <Button type="submit" disabled={pending} className="min-h-12 text-base">
        {pending ? 'Salvando…' : 'Salvar alterações'}
      </Button>
    </form>
  )
}
