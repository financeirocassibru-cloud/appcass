'use client'

import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createEntry, type EntryActionState } from '@/lib/actions/entries'
import { createGoal, recordGoalContribution } from '@/lib/actions/goals'
import { createInstallmentPlan } from '@/lib/actions/installments'
import { createRecurring } from '@/lib/actions/recurring'
import type { Category } from '@/lib/db/queries/categories'
import type { EntryKind } from '@/lib/db/types'
import { isISODate, isoWeekday, parseISODate } from '@/lib/finance/date'
import { firstDueFromNext, planInstallments } from '@/lib/finance/installments'
import { matchCategoryByKeywords } from '@/lib/finance/keywords'
import { formatCents } from '@/lib/finance/money'
import type { RecurrenceFrequency } from '@/lib/finance/types'
import { defaultFirstDue, type CreditOption } from '@/lib/finance/credit'
import { CreditSourceField } from '@/components/finance/credit-source'
import { KeywordField } from '@/components/finance/keyword-field'
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
 * v1.1 — 2026-09-27. A descrição escolhe a categoria pela palavra-chave (Ajustes ›
 * Categorias) enquanto a pessoa não tocar num chip — tocou, a escolha é dela e a palavra
 * não mexe mais.
 *
 * v1.2 — 2026-09-27. Saída ganhou **Meta**: escolher uma meta registra um aporte (uma saída
 * amarrada ao aporte, `recordGoalContribution`), e "Nova meta" cadastra uma (`createGoal`).
 * E todo modo ganhou "Conectar ao extrato" — as palavras-chave com que a importação reconhece
 * este item e o marca como pago (migration 0019), sugeridas a partir do que já foi importado.
 * Fica recolhido para o avulso continuar em dois toques.
 *
 * v1.3 — 2026-09-27 (Fase 13). "Pago com": Avulso (Saída e Entrada), Conta fixa e Parcelado
 * podem vir de um cartão ou de um empréstimo (`CreditSourceField`). A data continua sendo a do
 * gasto — a categoria conta nela —, e a dívida sai do saldo no vencimento. Na saída no cartão
 * o "Já paguei" some: quem paga é a fatura.
 *
 * O avulso continua sendo o padrão e o caminho mais curto: o valor já com foco, dois toques
 * para salvar (meta de `docs/DESIGN.md`). Os outros modos só **acrescentam** campos — valor,
 * categoria, descrição e data são os mesmos, e trocar de modo não perde o que já foi digitado.
 *
 * Nenhum caminho de escrita novo: cada modo chama a Server Action que já existia
 * (`createEntry`, `createRecurring`, `createInstallmentPlan`), com os nomes de campo que o
 * schema dela espera. Validação, `revalidatePath` e as garantias do banco vêm de graça.
 */

export type LaunchMode = 'single' | 'recurring' | 'installment' | 'goal'

/** Meta ativa, para o seletor do modo Meta. */
export interface LaunchGoal {
  id: string
  name: string
  savedCents: number
  targetAmountCents: number
}

/** Escolha do modo Meta: o id de uma meta existente, ou uma nova. */
const NEW_GOAL = 'nova'

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
        { value: 'goal', label: 'Meta' },
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
  goals = [],
  suggestions = { expense: [], income: [] },
  creditAccounts = [],
  onKindChange,
}: {
  expenseCategories: Category[]
  incomeCategories: Category[]
  today: string
  initialKind?: EntryKind
  initialMode?: LaunchMode
  /** Metas ativas, para o modo Meta. */
  goals?: LaunchGoal[]
  /** Descrições já importadas, por tipo, para sugerir palavra-chave. */
  suggestions?: Record<EntryKind, string[]>
  /** v1.3 — 2026-09-27: cartões e empréstimos ativos, para o "Pago com". */
  creditAccounts?: CreditOption[]
  /** Para a tela mostrar os atalhos do tipo escolhido. */
  onKindChange?: (kind: EntryKind) => void
}) {
  const router = useRouter()

  const [kind, setKind] = useState<EntryKind>(initialKind)
  const [mode, setMode] = useState<LaunchMode>(
    initialKind === 'income' && (initialMode === 'installment' || initialMode === 'goal')
      ? 'single'
      : initialMode,
  )
  const [cents, setCents] = useState(0)
  const [categoryId, setCategoryId] = useState('')
  /** A pessoa escolheu a categoria à mão? Aí a palavra-chave não mexe mais nela. */
  const [categoryTouched, setCategoryTouched] = useState(false)
  /** A palavra-chave que escolheu a categoria atual, para dizer isso na tela. */
  const [autoKeyword, setAutoKeyword] = useState<string | null>(null)
  const [date, setDate] = useState(today)

  // Conta fixa / renda fixa.
  const [frequency, setFrequency] = useState<RecurrenceFrequency>('monthly')
  const [showEnd, setShowEnd] = useState(false)

  // Parcelado.
  const [count, setCount] = useState(3)
  const [amountIs, setAmountIs] = useState<'total' | 'parcel'>('total')
  const [ongoing, setOngoing] = useState(false)
  const [paidCount, setPaidCount] = useState(1)

  // Meta: a meta escolhida, ou "nova". Sem nenhuma meta, só dá para criar.
  const [goalChoice, setGoalChoice] = useState<string>(goals[0]?.id ?? NEW_GOAL)
  const newGoal = goalChoice === NEW_GOAL
  const contribution = mode === 'goal' && !newGoal

  // "Conectar ao extrato": o campo de palavras-chave só aparece a pedido.
  const [showKeywords, setShowKeywords] = useState(false)

  // v1.3 — 2026-09-27: "Pago com" — `''` é o saldo.
  const [creditAccountId, setCreditAccountId] = useState('')
  const creditAccount = creditAccounts.find((a) => a.id === creditAccountId) ?? null
  // Renda fixa e meta não vêm de cartão; o seletor nem aparece nelas.
  const creditAllowed = mode === 'single' || (kind === 'expense' && (mode === 'recurring' || mode === 'installment'))
  const fundedExpense = creditAllowed && creditAccountId !== '' && kind === 'expense'

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
      if (mode === 'goal') {
        if (newGoal) {
          const result = await createGoal(previous, formData)
          if (result.success) {
            toast.success(result.success)
            router.push('/metas')
          }
          return { error: result.error }
        }
        const result = await recordGoalContribution(previous, formData)
        if (result.success) {
          toast.success(result.success)
          router.push(`/metas/${goalChoice}`)
        }
        return { error: result.error }
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
    setCategoryTouched(false)
    setAutoKeyword(null)
    if (option === 'income' && (mode === 'installment' || mode === 'goal')) setMode('single')
  }

  /** v1.3 — 2026-09-27: conta fixa e parcelamento só vão para cartão; empréstimo sai. */
  function chooseMode(option: LaunchMode) {
    setMode(option)
    if (option !== 'single' && creditAccounts.find((a) => a.id === creditAccountId)?.kind !== 'card') {
      setCreditAccountId('')
    }
  }

  function onDescriptionChange(description: string) {
    if (categoryTouched) return
    const match = matchCategoryByKeywords(
      description,
      kind,
      categories.map((c) => ({ id: c.id, kind: c.kind, keywords: c.keywords })),
    )
    if (match) {
      setCategoryId(match.categoryId)
      setAutoKeyword(match.keyword)
    } else if (autoKeyword) {
      // A palavra que escolheu saiu do texto: a categoria que ela pôs sai junto.
      setCategoryId('')
      setAutoKeyword(null)
    }
  }

  const submitLabel =
    mode === 'goal'
      ? newGoal
        ? 'Criar meta'
        : 'Registrar aporte'
      : mode === 'single'
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
        goalId={contribution ? goalChoice : null}
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
            onClick={() => chooseMode(option.value)}
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

      {mode === 'goal' ? (
        <div className="flex flex-col gap-2">
          <span className="text-muted-foreground text-sm font-medium">Meta</span>
          <div role="radiogroup" aria-label="Qual meta" className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-1">
            {[...goals.map((g) => ({ value: g.id, label: g.name })), { value: NEW_GOAL, label: '+ Nova meta' }].map(
              (option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={goalChoice === option.value}
                  onClick={() => setGoalChoice(option.value)}
                  className={cn(
                    'min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors',
                    goalChoice === option.value
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-input bg-card text-foreground',
                  )}
                >
                  {option.label}
                </button>
              ),
            )}
          </div>
          {contribution ? <GoalProgressNote goal={goals.find((g) => g.id === goalChoice)} /> : null}
        </div>
      ) : null}

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
          mode === 'goal'
            ? newGoal
              ? 'Quanto quer juntar'
              : 'Valor do aporte'
            : mode === 'installment'
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

      {categories.length > 0 && mode !== 'goal' ? (
        <div className="flex flex-col gap-2">
          <span className="text-muted-foreground text-sm font-medium">Categoria</span>
          {/* Chips em rolagem horizontal: em celular é mais rápido que um select. */}
          <div className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-1">
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                aria-pressed={categoryId === category.id}
                onClick={() => {
                  setCategoryId(categoryId === category.id ? '' : category.id)
                  setCategoryTouched(true)
                  setAutoKeyword(null)
                }}
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

      {/* O aporte não tem descrição própria: a saída se chama "Meta: <nome>". */}
      {contribution ? null : (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="campo-descricao">{mode === 'goal' ? 'Para quê' : 'Descrição'}</Label>
          <Input
            id="campo-descricao"
            // A meta nova vai para `createGoal`, que lê `name`.
            name={mode === 'goal' ? 'name' : 'description'}
            required
            // O parcelamento acrescenta " (12/12)" a cada parcela; o limite do schema dele é 100.
            maxLength={mode === 'installment' ? 100 : mode === 'goal' ? 60 : 120}
            placeholder={
              mode === 'goal'
                ? 'Viagem'
                : mode === 'installment'
                  ? 'Sofá'
                  : mode === 'recurring'
                    ? kind === 'expense'
                      ? 'Aluguel'
                      : 'Salário'
                    : kind === 'expense'
                      ? 'Mercado'
                      : 'Pix recebido'
            }
            onChange={(event) => onDescriptionChange(event.target.value)}
            className="min-h-11 text-base"
          />
          {autoKeyword && categoryId ? (
            <p className="text-muted-foreground text-xs" role="status">
              Categoria {categories.find((c) => c.id === categoryId)?.name} pela palavra-chave
              &ldquo;{autoKeyword}&rdquo;.
            </p>
          ) : null}
          {mode === 'installment' ? (
            <p className="text-muted-foreground text-xs">
              Cada parcela entra no histórico como &ldquo;Sofá (1/{safeCount || count})&rdquo;.
            </p>
          ) : null}
        </div>
      )}

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

      {mode === 'goal' && newGoal ? (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="campo-prazo">Até quando (opcional)</Label>
            <Input id="campo-prazo" name="targetDate" type="date" min={today} className="min-h-11 text-base" />
            <p className="text-muted-foreground text-xs">
              Com prazo, o app calcula sozinho quanto guardar por mês.
            </p>
          </div>
          <MoneyInput name="monthlyContributionCents" label="Ou defina o aporte mensal (opcional)" />
        </>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="campo-data">
            {mode === 'single' || mode === 'goal'
              ? fundedExpense
                ? 'Data do gasto'
                : 'Data'
              : mode === 'recurring'
                ? 'Começa em'
                : ongoing
                  ? 'Próxima parcela vence em'
                  : fundedExpense
                    ? 'Data da compra (1ª parcela)'
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
          {contribution ? (
            <p className="text-muted-foreground text-xs">
              Entra como saída da conta e como aporte na meta, no mesmo registro.
            </p>
          ) : null}
        </div>
      )}

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

      {creditAllowed ? (
        <CreditSourceField
          key={`${kind}-${mode === 'single' ? 'avulso' : 'regra'}`}
          accounts={creditAccounts}
          kind={kind}
          occurredOn={date}
          amountCents={mode === 'installment' ? totalCents : cents}
          value={creditAccountId}
          onChange={setCreditAccountId}
          allowLoan={mode === 'single'}
          allowCount={mode === 'single'}
          detail={mode === 'single'}
          suggestions={suggestions.expense}
        />
      ) : null}

      {/* A saída no cartão não se paga sozinha: quem a conclui é a fatura. */}
      {mode === 'single' && !fundedExpense ? (
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" name="isSettled" defaultChecked className="accent-primary size-5" />
          <span className="text-sm">{kind === 'expense' ? 'Já paguei' : 'Já recebi'}</span>
        </label>
      ) : null}

      {mode === 'installment' && preview.length > 0 ? (
        <InstallmentPreview
          preview={preview}
          paidCount={safePaid}
          card={fundedExpense ? creditAccount : null}
        />
      ) : null}

      {mode === 'installment' && totalCents > MAX_CENTS ? (
        <p className="text-sm text-[var(--destructive)]">O total passa do limite de valor.</p>
      ) : null}

      {contribution ? null : showKeywords ? (
        <div className="flex flex-col gap-2 rounded-xl bg-[var(--surface)] p-4">
          <KeywordField
            label="Palavras-chave do extrato"
            hint={keywordsHint(mode, kind)}
            suggestions={suggestions[kind]}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowKeywords(true)}
          className="text-muted-foreground min-h-11 self-start text-sm underline"
        >
          Conectar ao extrato
        </button>
      )}

      <FormMessage error={state.error} />

      <Button
        type="submit"
        disabled={
          pending ||
          (mode === 'installment' && (preview.length === 0 || cents === 0)) ||
          (mode === 'goal' && cents === 0)
        }
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
  goalId,
}: {
  mode: LaunchMode
  cents: number
  date: string
  frequency: RecurrenceFrequency
  totalCents: number
  count: number
  paidCount: number
  schedule: { firstDueOn: string; anchorDay: number | null } | null
  /** Meta do aporte; `null` quando o modo Meta cria uma meta nova. */
  goalId: string | null
}) {
  if (mode === 'goal') {
    return goalId ? (
      <>
        <input type="hidden" name="goalId" value={goalId} />
        <input type="hidden" name="amountCents" value={cents} />
        <input type="hidden" name="occurredOn" value={date} />
      </>
    ) : (
      <input type="hidden" name="targetAmountCents" value={cents} />
    )
  }

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

/** O que a palavra-chave faz, dito para o modo atual. v1.0 — 2026-09-27. */
function keywordsHint(mode: LaunchMode, kind: EntryKind): string {
  const paid = kind === 'income' ? 'recebida' : 'paga'
  if (mode === 'recurring') {
    return `Na importação, a linha do extrato com uma destas palavras marca a ocorrência do mês como ${paid}, com o valor do extrato. Ex.: o nome de quem paga ou de quem cobra.`
  }
  if (mode === 'installment') {
    return 'Na importação, a linha do extrato com uma destas palavras marca a parcela do mês como paga. A parcela mantém o valor dela.'
  }
  if (mode === 'goal') {
    return 'Na importação, a saída do extrato com uma destas palavras vira aporte nesta meta — por exemplo, o nome da caixinha ou do investimento.'
  }
  return `Se ficar pendente, a linha do extrato com uma destas palavras o marca como ${kind === 'income' ? 'recebido' : 'pago'} na importação, com o valor do extrato.`
}

/** A meta escolhida: quanto já tem e quanto falta. */
function GoalProgressNote({ goal }: { goal: LaunchGoal | undefined }) {
  if (!goal) return null
  const left = Math.max(0, goal.targetAmountCents - goal.savedCents)
  return (
    <p className="text-muted-foreground text-xs">
      {formatCents(goal.savedCents)} de {formatCents(goal.targetAmountCents)}
      {left > 0 ? ` · faltam ${formatCents(left)}` : ' · meta alcançada'}
    </p>
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
  card = null,
}: {
  preview: ReturnType<typeof planInstallments>
  paidCount: number
  /** v1.3 — 2026-09-27: no cartão, cada parcela mostra a fatura em que cai. */
  card?: CreditOption | null
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
                {!paid && card ? (
                  <span className="ml-2 text-xs">
                    fatura {formatShort(defaultFirstDue(card, parcel.dueOn) ?? parcel.dueOn)}
                  </span>
                ) : null}
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
