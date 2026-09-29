'use client'

import { useActionState, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { getEntryForEdit } from '@/lib/actions/entries'
import { renameCategory } from '@/lib/actions/categories'
import { updateInstallmentPlan, type InstallmentActionState } from '@/lib/actions/installments'
import type { Category } from '@/lib/db/queries/categories'
import type { EntryWithCategory } from '@/lib/db/queries/entries'
import type { SheetPlan } from '@/lib/db/queries/sheet'
import type { EntryKind } from '@/lib/db/types'
import type { CreditOption } from '@/lib/finance/credit'
import { formatCents, splitCents } from '@/lib/finance/money'
import { EntryForm } from '@/components/finance/entry-form'
import { MoneyInput } from '@/components/finance/money-input'
import { FormMessage } from '@/components/auth/form-field'
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
import { cn } from '@/lib/utils'

/**
 * As janelas da planilha — v1.0 — 28/09/2026 (Fase 14).
 *
 * Nenhuma escreve por conta própria: todas chamam as Server Actions que as outras telas já usam
 * (invariante 5). O que elas acrescentam é a **pergunta certa antes**:
 *
 * - conta fixa, renda fixa e meta: "Só este mês ou todos?" (`ScopeDialog`);
 * - parcela: "mudar uma muda todas" (`InstallmentWarningDialog`), porque a soma das parcelas é o
 *   total da compra (invariante 1) e não há como mudar uma sem desfazer isso.
 */

/** A pergunta de escopo, com a consequência de cada resposta escrita embaixo. */
export function ScopeDialog({
  open,
  title,
  description,
  onlyThisLabel = 'Só este mês',
  onlyThisHint,
  allLabel = 'Todos os meses',
  allHint,
  onChoose,
  onCancel,
}: {
  open: boolean
  title: string
  description: string
  onlyThisLabel?: string
  onlyThisHint: string
  allLabel?: string
  allHint: string
  onChoose: (scope: 'one' | 'all') => void
  onCancel: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <ScopeButton label={onlyThisLabel} hint={onlyThisHint} onClick={() => onChoose('one')} autoFocus />
          <ScopeButton label={allLabel} hint={allHint} onClick={() => onChoose('all')} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ScopeButton({
  label,
  hint,
  onClick,
  autoFocus,
}: {
  label: string
  hint: string
  onClick: () => void
  autoFocus?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      autoFocus={autoFocus}
      className="hover:bg-muted focus-visible:ring-ring flex flex-col items-start gap-0.5 rounded-lg border px-4 py-3 text-left focus-visible:ring-2 focus-visible:outline-none"
    >
      <span className="font-semibold">{label}</span>
      <span className="text-muted-foreground text-xs">{hint}</span>
    </button>
  )
}

/** "Mudar uma parcela muda todas" — e mostra como ficam. */
export function InstallmentWarningDialog({
  open,
  plan,
  newInstallmentCents,
  onConfirm,
  onCancel,
}: {
  open: boolean
  plan: SheetPlan | null
  /** O valor digitado para a parcela. */
  newInstallmentCents: number
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!plan) return null
  const total = newInstallmentCents * plan.installmentsCount
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mudar uma parcela muda todas</DialogTitle>
          <DialogDescription>
            {plan.description} tem {plan.installmentsCount} parcelas, e a soma delas é o total da
            compra. Para a soma continuar batendo, as {plan.installmentsCount} parcelas mudam juntas —
            inclusive as já pagas.
          </DialogDescription>
        </DialogHeader>
        <dl className="bg-muted grid grid-cols-2 gap-2 rounded-lg p-4 text-sm">
          <dt className="text-muted-foreground">Hoje</dt>
          <dd className="text-right tabular">
            {plan.installmentsCount}× · total {formatCents(plan.totalAmountCents)}
          </dd>
          <dt className="text-muted-foreground">Vai ficar</dt>
          <dd className="text-right font-semibold tabular">
            {plan.installmentsCount}× {formatCents(newInstallmentCents)} · total {formatCents(total)}
          </dd>
        </dl>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button onClick={onConfirm} disabled={newInstallmentCents <= 0} autoFocus>
            Mudar as {plan.installmentsCount} parcelas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const planInitial: InstallmentActionState = {}

/** O parcelamento inteiro: descrição, categoria e valor — com o mesmo aviso. */
export function PlanEditDialog({
  open,
  plan,
  categories,
  onClose,
}: {
  open: boolean
  plan: SheetPlan | null
  categories: Category[]
  onClose: (saved: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose(false)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Editar parcelamento</DialogTitle>
          <DialogDescription>
            O que mudar aqui vale para todas as parcelas — é uma compra só.
          </DialogDescription>
        </DialogHeader>
        {plan ? <PlanForm key={plan.id} plan={plan} categories={categories} onSaved={() => onClose(true)} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function PlanForm({
  plan,
  categories,
  onSaved,
}: {
  plan: SheetPlan
  categories: Category[]
  onSaved: () => void
}) {
  const [categoryId, setCategoryId] = useState(plan.categoryId ?? '')
  const [installment, setInstallment] = useState(splitCents(plan.totalAmountCents, plan.installmentsCount)[0] ?? 0)
  // O valor da parcela é o que a pessoa pensa; o total é o que vai. Mudar a parcela iguala todas.
  const [changedAmount, setChangedAmount] = useState(false)
  const total = changedAmount ? installment * plan.installmentsCount : plan.totalAmountCents

  const [state, formAction, pending] = useActionState(
    async (prev: InstallmentActionState, formData: FormData) => {
      const result = await updateInstallmentPlan(prev, formData)
      if (result.success) {
        toast.success(result.success)
        onSaved()
      }
      return result
    },
    planInitial,
  )

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="id" value={plan.id} />
      <input type="hidden" name="categoryId" value={categoryId} />
      <input type="hidden" name="totalAmountCents" value={total} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="plano-descricao">Descrição</Label>
        <Input id="plano-descricao" name="description" required maxLength={100} defaultValue={plan.description} />
      </div>

      <MoneyInput
        name={null}
        compact
        label="Valor de cada parcela"
        initialCents={installment}
        onCentsChange={(cents) => {
          setInstallment(cents)
          setChangedAmount(true)
        }}
      />
      <p className="text-muted-foreground bg-muted rounded-lg p-3 text-xs">
        {plan.installmentsCount}× — total {formatCents(total)}.{' '}
        {changedAmount
          ? `As ${plan.installmentsCount} parcelas passam a valer ${formatCents(installment)}, inclusive as já pagas.`
          : 'Mudar o valor muda todas as parcelas, inclusive as já pagas.'}
      </p>

      <CategoryChips categories={categories} value={categoryId} onChange={setCategoryId} />

      <FormMessage error={state.error} />
      <Button type="submit" disabled={pending || total <= 0}>
        {pending ? 'Salvando…' : `Salvar as ${plan.installmentsCount} parcelas`}
      </Button>
    </form>
  )
}

export function CategoryChips({
  categories,
  value,
  onChange,
}: {
  categories: Category[]
  value: string
  onChange: (id: string) => void
}) {
  if (categories.length === 0) return null
  return (
    <div className="flex flex-col gap-2">
      <span className="text-muted-foreground text-sm font-medium">Categoria</span>
      <div className="flex flex-wrap gap-2">
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            aria-pressed={value === category.id}
            onClick={() => onChange(value === category.id ? '' : category.id)}
            className={cn(
              'min-h-9 rounded-full border px-3 text-sm font-medium transition-colors',
              value === category.id
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-input bg-card text-foreground',
            )}
          >
            {category.name}
          </button>
        ))}
      </div>
    </div>
  )
}

const categoryInitial = {} as { error?: string; success?: string }

/** Renomear a categoria — o nome da linha. */
export function CategoryRenameDialog({
  open,
  category,
  onClose,
}: {
  open: boolean
  category: { id: string; name: string } | null
  onClose: (saved: boolean) => void
}) {
  const [state, formAction, pending] = useActionState(
    async (prev: typeof categoryInitial, formData: FormData) => {
      const result = await renameCategory(prev, formData)
      if (result.success) {
        toast.success(result.success)
        onClose(true)
      }
      return result
    },
    categoryInitial,
  )
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Renomear categoria</DialogTitle>
          <DialogDescription>
            Muda o nome em todos os lançamentos dela — no app inteiro, não só na planilha.
          </DialogDescription>
        </DialogHeader>
        {category ? (
          <form action={formAction} className="flex flex-col gap-4" key={category.id}>
            <input type="hidden" name="id" value={category.id} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="categoria-nome">Nome</Label>
              <Input id="categoria-nome" name="name" required maxLength={40} defaultValue={category.name} autoFocus />
            </div>
            <FormMessage error={state.error} />
            <Button type="submit" disabled={pending}>
              {pending ? 'Salvando…' : 'Salvar'}
            </Button>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

/**
 * Editar (ou criar) um lançamento com o formulário de sempre. O lançamento completo é lido sob
 * demanda (`getEntryForEdit`): a planilha só tem o resumo de cada célula.
 */
export function EntryDialog({
  open,
  entryId,
  createDefaults,
  categories,
  creditAccounts,
  today,
  onClose,
}: {
  open: boolean
  /** Editar este lançamento; `null` = criar um novo com `createDefaults`. */
  entryId: string | null
  createDefaults?: {
    kind: EntryKind
    categoryId?: string | null
    creditAccountId?: string
    date: string
    isSettled?: boolean
  }
  categories: Category[]
  creditAccounts: CreditOption[]
  today: string
  onClose: (changed: boolean) => void
}) {
  // O que foi lido, e para qual id: enquanto não bate com o pedido, está carregando. Derivado,
  // em vez de um `loading` que o efeito ligaria — setState síncrono dentro do efeito.
  const [loaded, setLoaded] = useState<{ id: string; entry: EntryWithCategory | null } | null>(null)

  useEffect(() => {
    if (!open || entryId === null) return
    let alive = true
    getEntryForEdit({ id: entryId })
      .then((result) => {
        if (alive) setLoaded({ id: entryId, entry: result })
      })
      .catch(() => {
        if (alive) setLoaded({ id: entryId, entry: null })
      })
    return () => {
      alive = false
    }
  }, [open, entryId])

  const entry = loaded && loaded.id === entryId ? loaded.entry : null
  const loading = entryId !== null && loaded?.id !== entryId

  const expense = categories.filter((c) => c.kind === 'expense' && c.archivedAt === null)
  const income = categories.filter((c) => c.kind === 'income' && c.archivedAt === null)
  const editing = entryId !== null
  const ready = !editing || entry !== null

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose(false)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar lançamento' : 'Novo lançamento'}</DialogTitle>
          <DialogDescription>
            {editing ? 'Altere o que precisar, ou exclua no fim do formulário.' : 'Já com o mês e a linha da planilha.'}
          </DialogDescription>
        </DialogHeader>
        {!ready ? (
          <p className="text-muted-foreground text-sm">{loading ? 'Carregando…' : 'Lançamento não encontrado.'}</p>
        ) : (
          <EntryForm
            key={entryId ?? `novo:${createDefaults?.date}:${createDefaults?.categoryId ?? ''}`}
            mode={editing ? 'edit' : 'create'}
            entry={editing ? (entry ?? undefined) : undefined}
            expenseCategories={expense}
            incomeCategories={income}
            today={editing ? today : (createDefaults?.date ?? today)}
            creditAccounts={creditAccounts}
            defaults={createDefaults}
            onDone={(result) => {
              toast.success(
                result === 'deleted' ? 'Lançamento excluído.' : editing ? 'Lançamento atualizado.' : 'Lançamento salvo.',
              )
              onClose(true)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
