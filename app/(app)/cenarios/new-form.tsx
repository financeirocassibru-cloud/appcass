'use client'

import { useActionState, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  createScenario,
  previewHabits,
  type HabitsPreview,
  type ScenarioActionState,
} from '@/lib/actions/scenarios'
import { isISODate } from '@/lib/finance/date'
import {
  habitSourceMonths,
  habitTargetMonths,
  habitWindowStart,
  type HabitKinds,
} from '@/lib/finance/habits'
import { formatCents } from '@/lib/finance/money'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FormMessage } from '@/components/auth/form-field'
import { cn } from '@/lib/utils'

const initialState: ScenarioActionState = {}

const MONTH_LABEL = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })

/** "agosto de 2026" a partir de `2026-08`, sem depender do fuso do aparelho. */
function monthLabel(month: string): string {
  const [year, m] = month.split('-').map(Number) as [number, number]
  return MONTH_LABEL.format(new Date(Date.UTC(year, m - 1, 1)))
}

const KIND_OPTIONS: { value: HabitKinds; label: string }[] = [
  { value: 'all', label: 'Tudo' },
  { value: 'expense', label: 'Só saídas' },
  { value: 'income', label: 'Só entradas' },
]

/**
 * v1.1 — 2026-09-27: ganhou `onCreated`, para a Análise poder criar um cenário num sheet e
 * fechá-lo ao terminar. `/cenarios` não passa nada e segue como era.
 *
 * v1.2 — 2026-09-27: **Duplicar hábitos.** Com o interruptor ligado, a pessoa escolhe um mês
 * fechado e para onde ele se repete (todos os meses seguintes do cenário, ou um intervalo). O
 * botão vira "Revisar": a prévia (`previewHabits`, que não escreve nada) mostra quanto seria
 * repetido de cada tipo e **pergunta** se é tudo, só saídas ou só entradas — sem opção
 * pré-marcada, para a pergunta não passar batida. Só depois disso o cenário é criado.
 *
 * A prévia é descartada a cada mudança de período ou de mês: confirmar números que já não
 * valem seria pior que não mostrar número nenhum.
 *
 * v1.3 — 2026-09-27: o mês atual, ainda em aberto, também pode ser a origem — marcado
 * "(em aberto)", com o aviso de que só entra o que já foi lançado.
 */
export function NewScenarioForm({
  today,
  defaultEnd,
  onCreated,
}: {
  today: string
  defaultEnd: string
  onCreated?: () => void
}) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)

  const [startsOn, setStartsOn] = useState(today)
  const [endsOn, setEndsOn] = useState(defaultEnd)
  const [habits, setHabits] = useState(false)
  // v1.1 — 2026-09-27: o mês atual, em aberto, é a primeira opção.
  const sourceOptions = habitSourceMonths(today, 12)
  const currentMonth = sourceOptions[0]
  const [sourceMonth, setSourceMonth] = useState(sourceOptions[0] ?? '')
  const [target, setTarget] = useState<'all' | 'range'>('all')
  const [rangeFrom, setRangeFrom] = useState('')
  const [rangeTo, setRangeTo] = useState('')
  const [kinds, setKinds] = useState<HabitKinds | null>(null)
  const [preview, setPreview] = useState<HabitsPreview | null>(null)
  const [previewing, startPreview] = useTransition()

  const [state, formAction, pending] = useActionState(
    async (prev: ScenarioActionState, formData: FormData) => {
      const result = await createScenario(prev, formData)
      if (result.success) {
        toast.success(result.success)
        router.refresh()
        onCreated?.()
      }
      return result
    },
    initialState,
  )

  // Os meses que podem receber o hábito, para montar o intervalo. A mesma função que a
  // Server Action usa — a lista da tela e a gravação não divergem.
  const validPeriod = isISODate(startsOn) && isISODate(endsOn) && startsOn <= endsOn
  const available = validPeriod
    ? habitTargetMonths({ sourceMonth, from: habitWindowStart(startsOn, today), to: endsOn })
    : []
  const from = available.includes(rangeFrom) ? rangeFrom : (available[0] ?? '')
  const to = available.includes(rangeTo) && rangeTo >= from ? rangeTo : (available.at(-1) ?? '')

  function invalidate() {
    setPreview(null)
    setKinds(null)
  }

  function review() {
    const form = formRef.current
    if (!form) return
    const data = new FormData(form)
    startPreview(async () => {
      setPreview(await previewHabits(data))
    })
  }

  const needsReview = habits && !preview?.summary
  const summary = preview?.summary

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="campo-nome">Nome</Label>
        <Input
          id="campo-nome"
          name="name"
          required
          maxLength={60}
          placeholder={habits ? 'Se eu mantiver os hábitos' : 'E se eu trocar de carro'}
          className="min-h-11 text-base"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="campo-inicio">De</Label>
          <Input
            id="campo-inicio"
            name="startsOn"
            type="date"
            required
            value={startsOn}
            onChange={(event) => {
              setStartsOn(event.target.value)
              invalidate()
            }}
            className="min-h-11 text-base"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="campo-fim">Até</Label>
          <Input
            id="campo-fim"
            name="endsOn"
            type="date"
            required
            value={endsOn}
            onChange={(event) => {
              setEndsOn(event.target.value)
              invalidate()
            }}
            className="min-h-11 text-base"
          />
        </div>
      </div>

      <label className="flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          name="habits"
          checked={habits}
          onChange={(event) => {
            setHabits(event.target.checked)
            invalidate()
          }}
          className="accent-primary size-5"
        />
        <span className="flex flex-col">
          <span className="text-sm font-medium">Duplicar hábitos</span>
          <span className="text-muted-foreground text-xs">
            Repete os lançamentos avulsos de um mês nos meses do cenário. Contas fixas, rendas
            fixas, parcelas e metas já entram sozinhas e não são duplicadas.
          </span>
        </span>
      </label>

      {habits ? (
        <div className="flex flex-col gap-4 rounded-xl border p-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="campo-origem">Repetir o mês de</Label>
            <select
              id="campo-origem"
              name="sourceMonth"
              value={sourceMonth}
              onChange={(event) => {
                setSourceMonth(event.target.value)
                invalidate()
              }}
              className="border-input bg-card min-h-11 rounded-md border px-3 text-base capitalize"
            >
              {sourceOptions.map((month) => (
                <option key={month} value={month}>
                  {monthLabel(month)}
                  {month === currentMonth ? ' (em aberto)' : ''}
                </option>
              ))}
            </select>
            {sourceMonth === currentMonth ? (
              <p className="text-muted-foreground text-xs">
                O mês ainda não fechou: entra o que já foi lançado até hoje.
              </p>
            ) : null}
            <p className="text-muted-foreground text-xs">
              Cada gasto cai no mesmo dia da semana: o do 2º sábado vai para o 2º sábado do mês
              seguinte.
            </p>
          </div>

          <input type="hidden" name="habitTarget" value={target} />
          <input type="hidden" name="rangeFrom" value={from} />
          <input type="hidden" name="rangeTo" value={to} />

          <div className="flex flex-col gap-2">
            <span className="text-muted-foreground text-sm font-medium">Aplicar em</span>
            <div role="radiogroup" aria-label="Aplicar em" className="flex flex-col gap-2">
              {(
                [
                  { value: 'all', label: 'Todos os meses seguintes, até o fim do cenário' },
                  { value: 'range', label: 'Só num intervalo de meses' },
                ] as const
              ).map((option) => (
                <label key={option.value} className="flex min-h-11 items-center gap-3">
                  <input
                    type="radio"
                    checked={target === option.value}
                    onChange={() => {
                      setTarget(option.value)
                      invalidate()
                    }}
                    className="accent-primary size-5"
                  />
                  <span className="text-sm">{option.label}</span>
                </label>
              ))}
            </div>

            {target === 'range' ? (
              available.length === 0 ? (
                <p className="text-muted-foreground text-xs">
                  Nenhum mês do cenário vem depois de {monthLabel(sourceMonth)}.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <MonthSelect
                    id="campo-de-mes"
                    label="De"
                    value={from}
                    options={available}
                    onChange={(value) => {
                      setRangeFrom(value)
                      invalidate()
                    }}
                  />
                  <MonthSelect
                    id="campo-ate-mes"
                    label="Até"
                    value={to}
                    options={available.filter((month) => month >= from)}
                    onChange={(value) => {
                      setRangeTo(value)
                      invalidate()
                    }}
                  />
                </div>
              )
            ) : null}
          </div>

          {preview?.error ? <FormMessage error={preview.error} /> : null}

          {summary ? (
            <div className="flex flex-col gap-3 border-t pt-4">
              <p className="text-sm">
                {preview.months && preview.months.length > 0 ? (
                  <>
                    Repetindo {monthLabel(sourceMonth)} em{' '}
                    <span className="font-medium">
                      {preview.months.length === 1
                        ? monthLabel(preview.months[0] ?? '')
                        : `${monthLabel(preview.months[0] ?? '')} a ${monthLabel(preview.months.at(-1) ?? '')}`}
                    </span>
                    . Dias que já passaram não entram — a projeção só olha para frente.
                  </>
                ) : (
                  'Nenhum mês do cenário vem depois do mês escolhido.'
                )}
              </p>

              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-sm font-semibold">O que duplicar?</legend>
                <input type="hidden" name="kinds" value={kinds ?? ''} />
                {KIND_OPTIONS.map((option) => {
                  const totals =
                    option.value === 'all'
                      ? {
                          count: summary.expense.count + summary.income.count,
                          cents: summary.income.cents - summary.expense.cents,
                        }
                      : option.value === 'expense'
                        ? { count: summary.expense.count, cents: -summary.expense.cents }
                        : summary.income
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={kinds === option.value}
                      onClick={() => setKinds(option.value)}
                      className={cn(
                        'flex min-h-12 items-center justify-between gap-3 rounded-lg border px-3 text-left text-sm transition-colors',
                        kinds === option.value
                          ? 'border-primary bg-primary/5 font-semibold'
                          : 'border-input bg-card',
                      )}
                    >
                      <span>{option.label}</span>
                      <span className="text-muted-foreground tabular text-xs">
                        {totals.count} {totals.count === 1 ? 'item' : 'itens'} ·{' '}
                        {totals.cents < 0 ? '−' : ''}
                        {formatCents(Math.abs(totals.cents))}
                      </span>
                    </button>
                  )
                })}
              </fieldset>
            </div>
          ) : null}
        </div>
      ) : null}

      <FormMessage error={state.error} />

      {needsReview ? (
        <Button
          type="button"
          onClick={review}
          disabled={previewing || !validPeriod || (target === 'range' && available.length === 0)}
          className="min-h-12 text-base"
        >
          {previewing ? 'Calculando…' : 'Revisar'}
        </Button>
      ) : (
        <Button
          type="submit"
          disabled={pending || (habits && kinds === null)}
          className="min-h-12 text-base"
        >
          {pending
            ? 'Criando…'
            : habits
              ? kinds === null
                ? 'Escolha o que duplicar'
                : 'Criar cenário e duplicar'
              : 'Criar cenário'}
        </Button>
      )}
    </form>
  )
}

function MonthSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="border-input bg-card min-h-11 rounded-md border px-3 text-base capitalize"
      >
        {options.map((month) => (
          <option key={month} value={month}>
            {monthLabel(month)}
          </option>
        ))}
      </select>
    </div>
  )
}
