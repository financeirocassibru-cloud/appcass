'use client'

import { useActionState, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  adjustBalanceWithEntry,
  resetBalance,
  type ProfileActionState,
} from '@/lib/actions/profile'
import { MoneyInput } from '@/components/finance/money-input'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FormMessage } from '@/components/auth/form-field'
import type { Category } from '@/lib/db/queries/categories'
import { balanceAdjustment } from '@/lib/finance/balance'
import { formatCents } from '@/lib/finance/money'
import { RESET_CONFIRMATION_PHRASE } from '@/lib/validation/profile'
import { cn } from '@/lib/utils'

const initialState: ProfileActionState = {}

type Mode = 'entry' | 'reset'

/** Nomes prontos para o ajuste, por tipo. v2.0 — 02/10/2026. */
const SUGGESTIONS = {
  expense: ['Tempo sem preencher', 'Gastei sem ver'],
  income: ['Entrada sem registro', 'Dinheiro esquecido'],
} as const

/** `2026-10-02` → `02/10/2026`, só para exibir: sem `Date`, sem fuso (invariante 2). */
function formatISODate(iso: string): string {
  const [year, month, day] = iso.split('-')
  return `${day}/${month}/${year}`
}

/**
 * Ajustar saldo. v2.0 — 02/10/2026.
 *
 * v2.0 (02/10/2026): dois modos.
 *
 * - **Lançar diferença** (padrão): a pessoa diz quanto tem agora e a diferença para o saldo
 *   calculado vira um lançamento liquidado hoje — saída se tem menos, entrada se tem mais —,
 *   com nome e categoria opcionais. O ajuste aparece no histórico em vez de sumir na âncora.
 * - **Zerar**: nova âncora (valor + data), sem explicar a diferença. Pode manter o histórico ou
 *   apagar os lançamentos anteriores à data — esse último só depois de digitar
 *   "Quero mesmo excluir" num diálogo de confirmação.
 *
 * Quem nunca informou o saldo abre direto em "Zerar": não há saldo anterior para comparar.
 *
 * O sinal fica num botão separado porque `MoneyInput` só aceita dígitos — e o sinal precisa
 * existir: quem está no vermelho tem saldo negativo.
 */
export function BalanceAnchorForm({
  currentCents,
  isConfigured,
  initialDate,
  today,
  expenseCategories,
  incomeCategories,
}: {
  currentCents: number
  isConfigured: boolean
  initialDate: string
  today: string
  expenseCategories: Category[]
  incomeCategories: Category[]
}) {
  const [mode, setMode] = useState<Mode>(isConfigured ? 'entry' : 'reset')
  // Começa no saldo calculado: diferença zero até a pessoa digitar o real.
  const [isNegative, setIsNegative] = useState(currentCents < 0)
  const [cents, setCents] = useState(Math.abs(currentCents))
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [wipeHistory, setWipeHistory] = useState(false)
  const [date, setDate] = useState(isConfigured ? today : initialDate)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const formRef = useRef<HTMLFormElement>(null)

  const targetCents = isNegative ? -cents : cents
  const adjustment = balanceAdjustment(currentCents, targetCents)
  const categories = adjustment?.kind === 'income' ? incomeCategories : expenseCategories
  // A categoria escolhida pertence a um tipo; se a diferença virou de lado, ela não vale mais.
  const effectiveCategoryId = categories.some((c) => c.id === categoryId) ? categoryId : ''

  const [adjustState, adjustAction, adjustPending] = useActionState(
    async (prev: ProfileActionState, formData: FormData) => {
      const result = await adjustBalanceWithEntry(prev, formData)
      if (result.success) {
        toast.success(result.success)
        setDescription('')
        setCategoryId('')
      }
      return result
    },
    initialState,
  )

  const [resetState, resetAction, resetPending] = useActionState(
    async (prev: ProfileActionState, formData: FormData) => {
      const result = await resetBalance(prev, formData)
      if (result.success) {
        toast.success(result.success)
        setConfirmation('')
        setWipeHistory(false)
      }
      return result
    },
    initialState,
  )

  const pending = mode === 'entry' ? adjustPending : resetPending
  const state = mode === 'entry' ? adjustState : resetState
  const confirmed = confirmation.trim() === RESET_CONFIRMATION_PHRASE

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    // Apagar histórico não sai sem a frase: o envio para aqui e o diálogo pede a confirmação.
    if (mode === 'reset' && wipeHistory && !confirmed) {
      event.preventDefault()
      setConfirmOpen(true)
    }
  }

  return (
    <>
      <form
        ref={formRef}
        action={mode === 'entry' ? adjustAction : resetAction}
        onSubmit={handleSubmit}
        className="flex flex-col gap-6"
      >
        <div role="radiogroup" aria-label="Como ajustar" className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1">
          {(['entry', 'reset'] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={mode === option}
              onClick={() => setMode(option)}
              className={cn(
                'min-h-11 rounded-md text-sm font-semibold transition-colors',
                mode === option ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground',
              )}
            >
              {option === 'entry' ? 'Lançar diferença' : 'Zerar'}
            </button>
          ))}
        </div>

        <input type="hidden" name="isNegative" value={isNegative ? 'true' : 'false'} />

        <div role="radiogroup" aria-label="Sinal do saldo" className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1">
          {[false, true].map((negative) => (
            <button
              key={negative ? 'negativo' : 'positivo'}
              type="button"
              role="radio"
              aria-checked={isNegative === negative}
              onClick={() => setIsNegative(negative)}
              className={cn(
                'min-h-11 rounded-md text-sm font-semibold transition-colors',
                isNegative === negative
                  ? negative
                    ? 'bg-card text-[var(--expense)] shadow-sm'
                    : 'bg-card text-[var(--income)] shadow-sm'
                  : 'text-muted-foreground',
              )}
            >
              {negative ? 'Negativo' : 'Positivo'}
            </button>
          ))}
        </div>

        <MoneyInput
          name={mode === 'entry' ? 'targetCents' : 'openingBalanceCents'}
          label={mode === 'entry' ? 'Quanto você tem agora' : 'Quanto você tem'}
          initialCents={Math.abs(currentCents)}
          onCentsChange={setCents}
          autoFocus
        />

        {mode === 'entry' ? (
          <>
            <input type="hidden" name="expectedKind" value={adjustment?.kind ?? 'expense'} />
            <input type="hidden" name="categoryId" value={effectiveCategoryId} />

            <div className="rounded-xl bg-[var(--surface)] p-4 text-sm" aria-live="polite">
              {adjustment ? (
                <p>
                  Diferença de{' '}
                  <strong
                    className={
                      adjustment.kind === 'expense' ? 'text-[var(--expense)]' : 'text-[var(--income)]'
                    }
                  >
                    {formatCents(adjustment.amountCents)}
                  </strong>{' '}
                  — entra no histórico como <strong>{adjustment.kind === 'expense' ? 'saída' : 'entrada'}</strong>{' '}
                  paga hoje.
                </p>
              ) : (
                <p className="text-[var(--foreground-muted)]">
                  Igual ao saldo calculado. Digite quanto você tem de verdade para ver a diferença.
                </p>
              )}
            </div>

            {adjustment ? (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="campo-ajuste-nome">Nome (opcional)</Label>
                  <Input
                    id="campo-ajuste-nome"
                    name="description"
                    maxLength={120}
                    placeholder="Ajuste de saldo"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    className="min-h-11 text-base"
                  />
                  <div className="flex flex-wrap gap-2 pt-1">
                    {SUGGESTIONS[adjustment.kind].map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        aria-pressed={description === suggestion}
                        onClick={() => setDescription(description === suggestion ? '' : suggestion)}
                        className={cn(
                          'min-h-9 rounded-full border px-3 text-sm transition-colors',
                          description === suggestion
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-input bg-card text-foreground',
                        )}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>

                {categories.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    <span className="text-muted-foreground text-sm font-medium">
                      Categoria (opcional)
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {categories.map((category) => (
                        <button
                          key={category.id}
                          type="button"
                          aria-pressed={effectiveCategoryId === category.id}
                          onClick={() =>
                            setCategoryId(effectiveCategoryId === category.id ? '' : category.id)
                          }
                          className={cn(
                            'min-h-11 rounded-full border px-4 text-sm font-medium transition-colors',
                            effectiveCategoryId === category.id
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
              </>
            ) : null}
          </>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="campo-saldo-data">A partir desta data</Label>
              <Input
                id="campo-saldo-data"
                name="openingBalanceOn"
                type="date"
                required
                max={today}
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="min-h-11 text-base"
              />
              <p className="text-muted-foreground text-xs">
                Começa um novo acompanhamento: a diferença não é explicada nem lançada.
                Lançamentos anteriores a essa data não entram mais na conta.
              </p>
            </div>

            <input type="hidden" name="wipeHistory" value={wipeHistory ? 'true' : 'false'} />
            <input type="hidden" name="confirmation" value={confirmation} />

            <div role="radiogroup" aria-label="Histórico anterior" className="flex flex-col gap-2">
              {[false, true].map((wipe) => (
                <button
                  key={wipe ? 'apagar' : 'manter'}
                  type="button"
                  role="radio"
                  aria-checked={wipeHistory === wipe}
                  onClick={() => setWipeHistory(wipe)}
                  className={cn(
                    'flex min-h-11 flex-col items-start rounded-xl border px-4 py-3 text-left transition-colors',
                    wipeHistory === wipe
                      ? wipe
                        ? 'border-[var(--expense)] bg-card'
                        : 'border-primary bg-card'
                      : 'border-input bg-card/50',
                  )}
                >
                  <span className="text-sm font-semibold">
                    {wipe ? 'Zerar histórico' : 'Manter histórico'}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {wipe
                      ? 'Exclui todos os lançamentos anteriores à data. Não dá para desfazer.'
                      : 'Os lançamentos antigos continuam no histórico, só não entram no saldo.'}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        <FormMessage error={state.error} />

        <Button
          type="submit"
          disabled={pending || (mode === 'entry' && !adjustment)}
          variant={mode === 'reset' && wipeHistory ? 'destructive' : 'default'}
          className="min-h-12 text-base"
        >
          {pending
            ? 'Salvando…'
            : mode === 'entry'
              ? 'Lançar ajuste'
              : wipeHistory
                ? 'Zerar e apagar histórico'
                : 'Zerar saldo'}
        </Button>
      </form>

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open)
          if (!open && !confirmed) setConfirmation('')
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir o histórico?</DialogTitle>
            <DialogDescription>
              Todos os lançamentos anteriores a {formatISODate(date)} serão excluídos — inclusive
              parcelas e contas fixas já lançadas. Os cadastros continuam. Isso não pode ser
              desfeito.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="campo-confirmacao">
              Para confirmar, digite <strong>{RESET_CONFIRMATION_PHRASE}</strong>
            </Label>
            <Input
              id="campo-confirmacao"
              autoComplete="off"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              className="min-h-11 text-base"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!confirmed}
              onClick={() => {
                setConfirmOpen(false)
                formRef.current?.requestSubmit()
              }}
            >
              Confirmar e excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
