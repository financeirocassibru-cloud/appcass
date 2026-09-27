'use client'

import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ChevronDown, Plus, Trash2 } from 'lucide-react'
import {
  createScenarioEntry,
  deleteScenarioEntry,
  updateScenarioEntry,
  type ScenarioActionState,
} from '@/lib/actions/scenarios'
import type { Category } from '@/lib/db/queries/categories'
import { monthKey } from '@/lib/finance/date'
import type { EntryKind, Scenario, ScenarioEntry } from '@/lib/finance/types'
import { Money } from '@/components/finance/money'
import { MoneyInput } from '@/components/finance/money-input'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const initialState: ScenarioActionState = {}

const MONTH_LABEL = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })

function monthLabel(month: string): string {
  const [year, m] = month.split('-').map(Number) as [number, number]
  return MONTH_LABEL.format(new Date(Date.UTC(year, m - 1, 1)))
}

/**
 * Itens que só existem dentro do cenário — o "e se eu comprasse um carro".
 *
 * Vivem em `scenario_entries`, nunca em `entries`. Apagar o cenário apaga os
 * itens junto e não deixa rastro no extrato.
 *
 * v1.1 — 2026-09-27: editáveis, e agrupados por mês. "Duplicar hábitos" cria dezenas de itens
 * por mês, e cada um precisa poder ser ajustado como se tivesse sido lançado à mão — valor,
 * data, descrição, tipo e categoria. O campo de valor passou a ser o `MoneyInput`, em vez de
 * uma segunda implementação dos dígitos escrita aqui.
 */
export function ScenarioEntries({
  scenario,
  today,
  expenseCategories,
  incomeCategories,
}: {
  scenario: Scenario
  today: string
  expenseCategories: Category[]
  incomeCategories: Category[]
}) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [, deleteAction, deletePending] = useActionState(
    async (prev: ScenarioActionState, formData: FormData) => {
      const result = await deleteScenarioEntry(prev, formData)
      if (result.success) {
        toast.success(result.success)
        router.refresh()
      }
      return result
    },
    initialState,
  )

  const groups = groupByMonth(scenario.entries)
  const [openMonths, setOpenMonths] = useState<ReadonlySet<string>>(
    () => new Set(groups.length > 0 ? [groups[0]!.month] : []),
  )

  function toggleMonth(month: string) {
    setOpenMonths((current) => {
      const next = new Set(current)
      if (next.has(month)) next.delete(month)
      else next.add(month)
      return next
    })
  }

  const formProps = { scenarioId: scenario.id, today, expenseCategories, incomeCategories }

  return (
    <section aria-labelledby="titulo-hipoteticos" className="flex flex-col gap-3">
      <h2 id="titulo-hipoteticos" className="text-base font-semibold">
        Itens hipotéticos
      </h2>

      {groups.length > 0 ? (
        <div className="flex flex-col gap-2">
          {groups.map((group) => {
            const open = openMonths.has(group.month)
            const net = group.items.reduce(
              (sum, item) => sum + (item.kind === 'income' ? item.amountCents : -item.amountCents),
              0,
            )
            return (
              <div key={group.month} className="rounded-xl bg-[var(--surface)]">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => toggleMonth(group.month)}
                  className="flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium capitalize">{monthLabel(group.month)}</span>
                    <span className="text-muted-foreground block text-xs">
                      {group.items.length} {group.items.length === 1 ? 'item' : 'itens'}
                    </span>
                  </span>
                  <Money
                    cents={Math.abs(net)}
                    kind={net < 0 ? 'expense' : 'income'}
                    className="shrink-0 text-sm"
                  />
                  <ChevronDown
                    className={cn('text-muted-foreground size-4 shrink-0 transition-transform', open && 'rotate-180')}
                    aria-hidden
                  />
                </button>

                {open ? (
                  <ul className="divide-border border-border divide-y border-t">
                    {group.items.map((entry) =>
                      editingId === entry.id ? (
                        <li key={entry.id} className="p-3">
                          <ScenarioEntryForm
                            {...formProps}
                            key={entry.id}
                            entry={entry}
                            onDone={() => {
                              setEditingId(null)
                              router.refresh()
                            }}
                            onCancel={() => setEditingId(null)}
                          />
                        </li>
                      ) : (
                        <li key={entry.id} className="flex items-center gap-2 px-4 py-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingId(entry.id)}
                            aria-label={`Editar ${entry.description}`}
                            className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">{entry.description}</span>
                              <span className="text-muted-foreground block text-xs">
                                {formatDate(entry.occursOn)}
                              </span>
                            </span>
                            <Money cents={entry.amountCents} kind={entry.kind} className="shrink-0 text-sm" />
                          </button>
                          <form action={deleteAction} className="shrink-0">
                            <input type="hidden" name="id" value={entry.id} />
                            <button
                              type="submit"
                              disabled={deletePending}
                              aria-label={`Remover ${entry.description}`}
                              className="text-muted-foreground hover:text-[var(--destructive)] flex size-11 items-center justify-center rounded-full disabled:opacity-50"
                            >
                              <Trash2 className="size-4" aria-hidden />
                            </button>
                          </form>
                        </li>
                      ),
                    )}
                  </ul>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : (
        <p className="rounded-xl bg-[var(--surface)] p-4 text-sm text-[var(--foreground-muted)]">
          Nada hipotético ainda. Some aqui um gasto ou uma renda que você está considerando, e veja
          o efeito no saldo.
        </p>
      )}

      {adding ? (
        <div className="bg-card border-border rounded-xl border p-4">
          <ScenarioEntryForm
            {...formProps}
            onDone={() => {
              setAdding(false)
              router.refresh()
            }}
            onCancel={() => setAdding(false)}
          />
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={() => setAdding(true)}
          className="min-h-12 justify-center gap-2"
        >
          <Plus className="size-4" aria-hidden />
          Somar um item hipotético
        </Button>
      )}
    </section>
  )
}

/**
 * Criar ou editar um item hipotético. Com `entry`, edita; sem, cria.
 *
 * v1.0 — 2026-09-27. **Quem reaproveita para mais de um item passa `key={entry.id}`**, pelo
 * mesmo motivo de `EntryForm`: tipo e categoria são estado local.
 */
function ScenarioEntryForm({
  scenarioId,
  entry,
  today,
  expenseCategories,
  incomeCategories,
  onDone,
  onCancel,
}: {
  scenarioId: string
  entry?: ScenarioEntry
  today: string
  expenseCategories: Category[]
  incomeCategories: Category[]
  onDone: () => void
  onCancel: () => void
}) {
  const [kind, setKind] = useState<EntryKind>(entry?.kind ?? 'expense')
  const [categoryId, setCategoryId] = useState(entry?.categoryId ?? '')
  const [cents, setCents] = useState(entry?.amountCents ?? 0)

  const [state, action, pending] = useActionState(
    async (prev: ScenarioActionState, formData: FormData) => {
      const result = entry
        ? await updateScenarioEntry(prev, formData)
        : await createScenarioEntry(prev, formData)
      if (result.success) {
        toast.success(result.success)
        onDone()
      }
      return result
    },
    initialState,
  )

  const categories = kind === 'expense' ? expenseCategories : incomeCategories
  const prefix = entry ? `hip-${entry.id}` : 'hip-novo'

  return (
    <form action={action} className="flex flex-col gap-3">
      {entry ? <input type="hidden" name="id" value={entry.id} /> : null}
      <input type="hidden" name="scenarioId" value={scenarioId} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="categoryId" value={categoryId} />

      <div role="radiogroup" aria-label="Tipo" className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1">
        {(['expense', 'income'] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={kind === option}
            onClick={() => {
              setKind(option)
              setCategoryId('')
            }}
            className={cn(
              'min-h-11 rounded-md text-sm font-semibold transition-colors',
              kind === option
                ? option === 'expense'
                  ? 'bg-card text-[var(--expense)] shadow-sm'
                  : 'bg-card text-[var(--income)] shadow-sm'
                : 'text-muted-foreground',
            )}
          >
            {option === 'expense' ? 'Gasto' : 'Renda'}
          </button>
        ))}
      </div>

      <MoneyInput
        label="Valor"
        compact
        initialCents={entry?.amountCents}
        autoFocus={!entry}
        onCentsChange={setCents}
      />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${prefix}-descricao`}>Descrição</Label>
        <Input
          id={`${prefix}-descricao`}
          name="description"
          required
          maxLength={120}
          defaultValue={entry?.description}
          placeholder="Carro novo"
          className="min-h-11 text-base"
        />
      </div>

      {categories.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span className="text-muted-foreground text-xs font-medium">Categoria</span>
          <div className="flex gap-2 overflow-x-auto pb-1">
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

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${prefix}-data`}>Quando</Label>
        <Input
          id={`${prefix}-data`}
          name="occursOn"
          type="date"
          required
          defaultValue={entry?.occursOn ?? today}
          className="min-h-11 text-base"
        />
      </div>

      {state.error ? <p className="text-[var(--destructive)] text-xs">{state.error}</p> : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending || cents === 0} className="min-h-11 flex-1">
          {pending ? 'Salvando…' : entry ? 'Salvar' : 'Somar ao cenário'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} className="min-h-11">
          Cancelar
        </Button>
      </div>
    </form>
  )
}

function groupByMonth(entries: readonly ScenarioEntry[]): { month: string; items: ScenarioEntry[] }[] {
  const byMonth = new Map<string, ScenarioEntry[]>()
  for (const entry of entries) {
    const month = monthKey(entry.occursOn)
    const bucket = byMonth.get(month)
    if (bucket) bucket.push(entry)
    else byMonth.set(month, [entry])
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([month, items]) => ({ month, items }))
}

/** `dd/mm/aaaa` sem passar por `Date` no fuso local. */
function formatDate(date: string): string {
  const [year, month, day] = date.split('-')
  return `${day}/${month}/${year}`
}
