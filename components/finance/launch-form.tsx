'use client'

import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createEntry, type EntryActionState } from '@/lib/actions/entries'
import { createInstallmentPlan } from '@/lib/actions/installments'
import { createRecurring } from '@/lib/actions/recurring'
import type { Category } from '@/lib/db/queries/categories'
import type { EntryKind } from '@/lib/db/types'
import { isISODate, isoWeekday, parseISODate } from '@/lib/finance/date'
import { firstDueFromNext, planInstallments } from '@/lib/finance/installments'
import { formatCents } from '@/lib/finance/money'
import type { RecurrenceFrequency } from '@/lib/finance/types'
import { MoneyInput } from '@/components/finance/money-input'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FormMessage } from '@/components/auth/form-field'
import { cn } from '@/lib/utils'

/**
 * O [+]: lançamento avulso, conta fixa, renda fixa e parcelamento no mesmo formulário.
 *
 * v1.0 — 2026-09-27. Até aqui conta fixa e parcelamento moravam na aba Mais, e cadastrar um
 * deles custava quatro telas. Agora são um chip abaixo de Saída/Entrada.
 *
 * O avulso continua sendo o padrão e o caminho mais curto: o valor já com foco, dois toques
 * para salvar (meta de `docs/DESIGN.md`). Os outros modos só **acrescentam** campos — valor,
 * categoria, descrição e data são os mesmos, e trocar de modo não perde o que já foi digitado.
 *
 * Nenhum caminho de escrita novo: cada modo chama a Server Action que já existia
 * (`createEntry`, `createRecurring`, `createInstallmentPlan`), com os nomes de campo que o
 * schema dela espera. Validação, `revalidatePath` e as garantias do banco vêm de graça.
 */

export type LaunchMode = 'single' | 'recurring' | 'installment'

type ActionState = EntryActionState

const initialState: ActionState = {}

const INSTALLMENT_SHORTCUTS = [2, 3, 6, 10, 12]

const FREQUENCIES: { value: RecurrenceFrequency; label: string }[] = [
  { value: 'monthly', label: 'Mensal' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'yearly', label: 'Anual' },
]

const WEEKDAYS = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo']

const MAX_CENTS = 9_999_999_999

function modesFor(kind: EntryKind): { value: LaunchMode; label: string }[] {
  return kind === 'expense'
    ? [
        { value: 'single', label: 'Avulso' },
        { value: 'recurring', label: 'Conta fixa' },
        { value: 'installment', label: 'Parcelado' },
      ]
    : [
        { value: 'single', label: 'Avulsa' },
        { value: 'recurring', label: 'Renda fixa' },
      ]
}

export function LaunchForm({
  expenseCategories,
  incomeCategories,
  today,
  initialKind = 'expense',
  initialMode = 'single',
  onKindChange,
}: {
  expenseCategories: Category[]
  incomeCategories: Category[]
  today: string
  initialKind?: EntryKind
  initialMode?: LaunchMode
  /** Para a tela mostrar os atalhos do tipo escolhido. */
  onKindChange?: (kind: EntryKind) => void
}) {
  const router = useRouter()

  const [kind, setKind] = useState<EntryKind>(initialKind)
  const [mode, setMode] = useState<LaunchMode>(
    initialKind === 'income' && initialMode === 'installment' ? 'single' : initialMode,
  )
  const [cents, setCents] = useState(0)
  const [categoryId, setCategoryId] = useState('')
  const [date, setDate] = useState(today)

  // Conta fixa / renda fixa.
  const [frequency, setFrequency] = useState<RecurrenceFrequency>('monthly')
  const [showEnd, setShowEnd] = useState(false)

  // Parcelado.
  const [count, setCount] = useState(3)
  const [amountIs, setAmountIs] = useState<'total' | 'parcel'>('total')
  const [ongoing, setOngoing] = useState(false)
  const [paidCount, setPaidCount] = useState(1)

  const [state, formAction, pending] = useActionState(
    async (previous: ActionState, formData: FormData): Promise<ActionState> => {
      if (mode === 'single') {
        const result = await createEntry(previous, formData)
        if (result.success) {
          toast.success('Lançamento salvo.')
          router.push('/historico')
        }
        return result
      }
      if (mode === 'recurring') {
        const result = await createRecurring(previous, formData)
        if (result.success) {
          toast.success(kind === 'income' ? 'Renda fixa criada.' : result.success)
          router.push(kind === 'income' ? '/rendas' : '/compromissos')
        }
        return { error: result.error }
      }
      const result = await createInstallmentPlan(previous, formData)
      if (result.success) {
        toast.success(result.success)
        router.push('/parcelas')
      }
      return { error: result.error }
    },
    initialState,
  )

  const categories = kind === 'expense' ? expenseCategories : incomeCategories
  const validDate = isISODate(date)

  // --- Parcelado: o total enviado e a prévia saem da mesma conta que a Server Action faz.
  const safeCount = Number.isInteger(count) && count >= 2 && count <= 360 ? count : 0
  const safePaid = ongoing ? Math.min(Math.max(0, paidCount), Math.max(0, safeCount - 1)) : 0
  const totalCents = amountIs === 'total' ? cents : cents * safeCount
  const schedule =
    mode === 'installment' && validDate && safeCount > 0
      ? ongoing
        ? firstDueFromNext(date, safePaid)
        : { firstDueOn: date, anchorDay: null }
      : null
  const preview =
    schedule && totalCents > 0 && totalCents <= MAX_CENTS
      ? planInstallments({
          id: 'previa',
          description: 'x',
          categoryId: null,
          totalAmountCents: totalCents,
          installmentsCount: safeCount,
          firstDueOn: schedule.firstDueOn,
          anchorDay: schedule.anchorDay ?? undefined,
        })
      : []

  function chooseKind(option: EntryKind) {
    setKind(option)
    onKindChange?.(option)
    // A categoria escolhida pertence ao tipo anterior; limpar evita enviar uma categoria de
    // despesa num lançamento de receita. E renda não se parcela.
    setCategoryId('')
    if (option === 'income' && mode === 'installment') setMode('single')
  }

  const submitLabel =
    mode === 'single'
      ? 'Salvar'
      : mode === 'recurring'
        ? kind === 'income'
          ? 'Criar renda fixa'
          : 'Criar conta fixa'
        : `Criar parcelamento em ${safeCount || count}x`

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="categoryId" value={categoryId} />
      <HiddenFields
        mode={mode}
        cents={cents}
        date={date}
        frequency={frequency}
        totalCents={totalCents}
        count={safeCount || count}
        paidCount={safePaid}
        schedule={schedule}
      />

      {/* Saída/entrada primeiro: define o significado de tudo abaixo. */}
      <div role="radiogroup" aria-label="Tipo" className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1">
        {(['expense', 'income'] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={kind === option}
            onClick={() => chooseKind(option)}
            className={cn(
              'min-h-11 rounded-md text-sm font-semibold transition-colors',
              kind === option
                ? option === 'expense'
                  ? 'bg-card text-[var(--expense)] shadow-sm'
                  : 'bg-card text-[var(--income)] shadow-sm'
                : 'text-muted-foreground',
            )}
          >
            {option === 'expense' ? 'Saída' : 'Entrada'}
          </button>
        ))}
      </div>

      {/* O modo. Avulso é o padrão; os outros estão a um toque. */}
      <div role="radiogroup" aria-label="Como se repete" className="flex gap-2 overflow-x-auto pb-1">
        {modesFor(kind).map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={mode === option.value}
            onClick={() => setMode(option.value)}
            className={cn(
              'min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors',
              mode === option.value
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-input bg-card text-foreground',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {mode === 'installment' ? (
        <div className="flex flex-col gap-3">
          <div role="radiogroup" aria-label="O valor informado é" className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1">
            {(
              [
                { value: 'total', label: 'Valor total' },
                { value: 'parcel', label: 'Valor da parcela' },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={amountIs === option.value}
                onClick={() => setAmountIs(option.value)}
                className={cn(
                  'min-h-11 rounded-md text-sm font-medium transition-colors',
                  amountIs === option.value ? 'bg-card text-[var(--brand)] shadow-sm' : 'text-muted-foreground',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <MoneyInput
        name={null}
        label={
          mode === 'installment'
            ? amountIs === 'total'
              ? 'Valor total da compra'
              : 'Valor de cada parcela'
            : mode === 'recurring'
              ? 'Valor de cada ocorrência'
              : 'Valor'
        }
        autoFocus
        onCentsChange={setCents}
      />

      {mode === 'installment' ? (
        <div className="flex flex-col gap-2">
          <span className="text-muted-foreground text-sm font-medium">Em quantas vezes</span>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {INSTALLMENT_SHORTCUTS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={count === option}
                onClick={() => setCount(option)}
                className={cn(
                  'min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors',
                  count === option
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-input bg-card text-foreground',
                )}
              >
                {option}x
              </button>
            ))}
            <Input
              type="number"
              min={2}
              max={360}
              inputMode="numeric"
              aria-label="Outro número de parcelas"
              value={count}
              onChange={(event) => setCount(Number(event.target.value))}
              className="min-h-11 w-24 shrink-0 text-base"
            />
          </div>
        </div>
      ) : null}

      {categories.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span className="text-muted-foreground text-sm font-medium">Categoria</span>
          {/* Chips em rolagem horizontal: em celular é mais rápido que um select. */}
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

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="campo-descricao">Descrição</Label>
        <Input
          id="campo-descricao"
          name="description"
          required
          // O parcelamento acrescenta " (12/12)" a cada parcela; o limite do schema dele é 100.
          maxLength={mode === 'installment' ? 100 : 120}
          placeholder={
            mode === 'installment'
              ? 'Sofá'
              : mode === 'recurring'
                ? kind === 'expense'
                  ? 'Aluguel'
                  : 'Salário'
                : kind === 'expense'
                  ? 'Mercado'
                  : 'Pix recebido'
          }
          className="min-h-11 text-base"
        />
        {mode === 'installment' ? (
          <p className="text-muted-foreground text-xs">
            Cada parcela entra no histórico como &ldquo;Sofá (1/{safeCount || count})&rdquo;.
          </p>
        ) : null}
      </div>

      {mode === 'installment' ? (
        <div className="flex flex-col gap-3 rounded-xl bg-[var(--surface)] p-4">
          <label className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              checked={ongoing}
              onChange={(event) => setOngoing(event.target.checked)}
              className="accent-primary size-5"
            />
            <span className="text-sm">Já está em andamento — algumas parcelas já foram pagas</span>
          </label>

          {ongoing ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="campo-pagas">Parcelas já pagas</Label>
              <Input
                id="campo-pagas"
                type="number"
                min={1}
                max={Math.max(1, (safeCount || count) - 1)}
                inputMode="numeric"
                value={paidCount}
                onChange={(event) => setPaidCount(Number(event.target.value))}
                className="min-h-11 w-28 text-base"
              />
              <p className="text-muted-foreground text-xs">
                Elas entram como pagas, cada uma na data em que venceu. Se o saldo que você
                informou em Ajustes é mais recente que elas, ele não muda — já estavam descontadas.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="campo-data">
          {mode === 'single'
            ? 'Data'
            : mode === 'recurring'
              ? 'Começa em'
              : ongoing
                ? 'Próxima parcela vence em'
                : 'Primeira parcela vence em'}
        </Label>
        <Input
          id="campo-data"
          type="date"
          required
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="min-h-11 text-base"
        />
        {mode === 'recurring' && validDate ? (
          <p className="text-muted-foreground text-xs">{recurrenceHint(frequency, date)}</p>
        ) : null}
        {mode === 'installment' ? (
          <p className="text-muted-foreground text-xs">
            As seguintes caem no mesmo dia dos meses seguintes. Dia 31 vira 28 em fevereiro.
          </p>
        ) : null}
      </div>

      {mode === 'recurring' ? (
        <>
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
                    frequency === option.value ? 'bg-card text-[var(--brand)] shadow-sm' : 'text-muted-foreground',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {showEnd ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="campo-fim">Termina em</Label>
              <Input id="campo-fim" name="endsOn" type="date" className="min-h-11 text-base" />
              <p className="text-muted-foreground text-xs">Deixe vazio para não ter prazo de fim.</p>
            </div>
          ) : (
            <>
              <input type="hidden" name="endsOn" value="" />
              <button
                type="button"
                onClick={() => setShowEnd(true)}
                className="text-muted-foreground min-h-11 self-start text-sm underline"
              >
                Tem data para acabar?
              </button>
            </>
          )}
        </>
      ) : null}

      {mode === 'single' ? (
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" name="isSettled" defaultChecked className="accent-primary size-5" />
          <span className="text-sm">{kind === 'expense' ? 'Já paguei' : 'Já recebi'}</span>
        </label>
      ) : null}

      {mode === 'installment' && preview.length > 0 ? (
        <InstallmentPreview preview={preview} paidCount={safePaid} />
      ) : null}

      {mode === 'installment' && totalCents > MAX_CENTS ? (
        <p className="text-sm text-[var(--destructive)]">O total passa do limite de valor.</p>
      ) : null}

      <FormMessage error={state.error} />

      <Button
        type="submit"
        disabled={pending || (mode === 'installment' && (preview.length === 0 || cents === 0))}
        className="min-h-12 text-base"
      >
        {pending ? 'Salvando…' : submitLabel}
      </Button>
    </form>
  )
}

/**
 * Os campos que cada Server Action espera, com os nomes do schema dela. Só os do modo atual
 * vão no `FormData` — um `amountCents` sobrando não atrapalharia, mas um `occurredOn` com a
 * data de início de uma regra confundiria quem lesse o pedido depois.
 */
function HiddenFields({
  mode,
  cents,
  date,
  frequency,
  totalCents,
  count,
  paidCount,
  schedule,
}: {
  mode: LaunchMode
  cents: number
  date: string
  frequency: RecurrenceFrequency
  totalCents: number
  count: number
  paidCount: number
  schedule: { firstDueOn: string; anchorDay: number | null } | null
}) {
  if (mode === 'single') {
    return (
      <>
        <input type="hidden" name="amountCents" value={cents} />
        <input type="hidden" name="occurredOn" value={date} />
      </>
    )
  }

  if (mode === 'recurring') {
    // Mensal vence no dia da data de início — um campo a menos para preencher. Semanal e anual
    // saem da própria data de início, e o schema recusa dia nesses casos.
    const day = frequency === 'monthly' && isISODate(date) ? String(parseISODate(date).day) : ''
    return (
      <>
        <input type="hidden" name="amountCents" value={cents} />
        <input type="hidden" name="frequency" value={frequency} />
        <input type="hidden" name="dayOfMonth" value={day} />
        <input type="hidden" name="startsOn" value={date} />
      </>
    )
  }

  return (
    <>
      <input type="hidden" name="totalAmountCents" value={totalCents} />
      <input type="hidden" name="installmentsCount" value={count} />
      <input type="hidden" name="firstDueOn" value={schedule?.firstDueOn ?? date} />
      <input type="hidden" name="anchorDay" value={schedule?.anchorDay ?? ''} />
      <input type="hidden" name="paidCount" value={paidCount} />
    </>
  )
}

/** "Vence todo dia 5", "Toda quinta", "Todo ano em 05/10". */
function recurrenceHint(frequency: RecurrenceFrequency, date: string): string {
  const { day, month } = parseISODate(date)
  if (frequency === 'monthly') {
    return `Vence todo dia ${day}. Dia 31 cai no último dia dos meses mais curtos.`
  }
  if (frequency === 'weekly') return `Toda ${WEEKDAYS[isoWeekday(date) - 1]}.`
  return `Todo ano em ${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}.`
}

/**
 * A prévia do rateio: o resultado de `planInstallments()`, o mesmo que a Server Action grava.
 * A linha do total prova que fecha, centavo a centavo; as já pagas aparecem marcadas.
 */
function InstallmentPreview({
  preview,
  paidCount,
}: {
  preview: ReturnType<typeof planInstallments>
  paidCount: number
}) {
  const total = preview.reduce((sum, parcel) => sum + parcel.amountCents, 0)

  return (
    <section className="flex flex-col gap-2 rounded-xl bg-[var(--surface)] p-4">
      <h2 className="text-sm font-semibold">Como vai ficar</h2>
      <ul className="divide-border flex max-h-64 flex-col divide-y overflow-y-auto">
        {preview.map((parcel) => {
          const paid = parcel.installmentNumber <= paidCount
          return (
            <li key={parcel.occurrenceKey} className="flex items-center justify-between gap-3 py-1.5 text-sm">
              <span className="text-muted-foreground">
                {parcel.installmentNumber}/{parcel.installmentTotal} · {formatShort(parcel.dueOn)}
                {paid ? <span className="ml-2 text-xs text-[var(--income)]">paga</span> : null}
              </span>
              <span className={cn('tabular font-medium', paid && 'text-muted-foreground')}>
                {formatCents(parcel.amountCents)}
              </span>
            </li>
          )
        })}
      </ul>
      <p className="border-border flex items-center justify-between gap-3 border-t pt-2 text-sm font-semibold">
        <span>Soma das parcelas</span>
        <span className="tabular">{formatCents(total)}</span>
      </p>
    </section>
  )
}

/** `dd/mm/aa` sem passar por `Date` no fuso local. */
function formatShort(date: string): string {
  const [year, month, day] = date.split('-')
  return `${day}/${month}/${year?.slice(2)}`
}
