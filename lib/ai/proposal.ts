import { z } from 'zod'
import { isISODate } from '@/lib/finance/date'
import { formatCents } from '@/lib/finance/money'

/**
 * A proposta da IA: validação, texto de confirmação e tradução para FormData.
 * v1.1 — 2026-09-26.
 *
 * v1.1: acrescentada `hasFunctionCall`, que responde se a resposta do modelo já traz
 * chamada de ferramenta. Quem precisa dela é `advanceJob`: uma interação que já
 * emitiu as chamadas está pronta para este app, qualquer que seja o status dela do
 * lado do provedor.
 *
 * Módulo **puro** — sem I/O, sem Supabase, sem relógio (invariante 9). É o que
 * fica entre o que o modelo respondeu e o que o app executa, e por isso é o que
 * mais precisa de teste unitário.
 *
 * Três trabalhos, nesta ordem:
 *
 *  1. `parseFunctionCalls` — a resposta do modelo entra como `unknown` e sai
 *     como `Proposal` tipada, ou é recusada. Saída de modelo é DADO, nunca
 *     comando: nada daqui executa sem passar por Zod e sem alguém confirmar.
 *  2. `describeOperation` — a frase em português que a pessoa lê antes de
 *     confirmar. É o "só pedir confirmação para ver se entendeu direito".
 *  3. `operationToFormData` — o `FormData` com os nomes de campo EXATOS que
 *     cada Server Action lê. Assim a execução reaproveita a action inteira, com
 *     o Zod dela, as guardas `.eq()/.select()` e o `revalidatePath`, em vez de
 *     reimplementar a regra num segundo lugar.
 *
 * Por que as ferramentas usam snake_case e o FormData camelCase: o snake_case é
 * o vocabulário que o modelo vê, alinhado com as colunas do banco; o camelCase
 * é o que os formulários da tela já mandam. A tradução entre os dois acontece
 * aqui, uma vez.
 */

// ---------------------------------------------------------------------------
// Peças compartilhadas
// ---------------------------------------------------------------------------

/**
 * Centavos, e só centavos.
 *
 * `z.number().int()` e não `z.coerce`: se o modelo mandar `87.5` querendo dizer
 * R$ 87,50, o certo é recusar e pedir de novo. Arredondar criaria um lançamento
 * de oitenta e sete centavos com cara de correto — exatamente o bug de `float`
 * que o invariante 1 existe para impedir.
 */
const cents = z
  .number()
  .int('O valor precisa vir em centavos inteiros')
  .positive('O valor precisa ser maior que zero')
  .max(9_999_999_999, 'Valor acima do limite')

const isoDate = z.string().trim().refine(isISODate, 'Data inválida')
const optionalIsoDate = isoDate.nullish()
const uuid = z.string().uuid('Identificador inválido')
const shortText = z.string().trim().min(1).max(120)

/** `category_id` só é aceito como UUID; qualquer outra coisa vira "sem categoria". */
const categoryRef = {
  category_id: z.string().nullish(),
  category_name: z.string().trim().nullish(),
}

const kind = z.enum(['expense', 'income'])

// ---------------------------------------------------------------------------
// As operações, uma variante por ferramenta de tools.ts
// ---------------------------------------------------------------------------

export const operationSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('create_entry'),
    kind,
    amount_cents: cents,
    occurred_on: isoDate,
    description: shortText,
    notes: z.string().trim().nullish(),
    is_settled: z.boolean(),
    ...categoryRef,
  }),
  z.object({
    op: z.literal('update_entry'),
    id: uuid,
    kind,
    amount_cents: cents,
    occurred_on: isoDate,
    description: shortText,
    notes: z.string().trim().nullish(),
    is_settled: z.boolean(),
    ...categoryRef,
  }),
  z.object({ op: z.literal('delete_entry'), id: uuid }),
  z.object({ op: z.literal('settle_entry'), id: uuid, is_settled: z.boolean() }),

  z.object({
    op: z.literal('create_recurring'),
    kind,
    description: shortText,
    amount_cents: cents,
    frequency: z.enum(['monthly', 'weekly', 'yearly']),
    day_of_month: z.number().int().min(1).max(31).nullish(),
    starts_on: isoDate,
    ends_on: optionalIsoDate,
    ...categoryRef,
  }),
  z.object({
    op: z.literal('update_recurring'),
    id: uuid,
    kind,
    description: shortText,
    amount_cents: cents,
    frequency: z.enum(['monthly', 'weekly', 'yearly']),
    day_of_month: z.number().int().min(1).max(31).nullish(),
    starts_on: isoDate,
    ends_on: optionalIsoDate,
    ...categoryRef,
  }),
  z.object({ op: z.literal('toggle_recurring_active'), id: uuid, is_active: z.boolean() }),
  z.object({ op: z.literal('delete_recurring'), id: uuid }),
  z.object({ op: z.literal('materialize_recurring'), rule_id: uuid, occurs_on: isoDate }),

  z.object({
    op: z.literal('create_installment_plan'),
    description: z.string().trim().min(1).max(100),
    total_amount_cents: cents,
    // O piso de 2 é do schema da action: "em 1x" é um lançamento avulso.
    installments_count: z.number().int().min(2, 'Use ao menos 2 parcelas').max(360),
    first_due_on: isoDate,
    ...categoryRef,
  }),
  z.object({ op: z.literal('delete_installment_plan'), id: uuid }),

  z.object({
    op: z.literal('create_goal'),
    name: z.string().trim().min(1).max(60),
    target_amount_cents: cents,
    target_date: optionalIsoDate,
    monthly_contribution_cents: cents.nullish(),
  }),
  z.object({
    op: z.literal('update_goal'),
    id: uuid,
    name: z.string().trim().min(1).max(60),
    target_amount_cents: cents,
    target_date: optionalIsoDate,
    monthly_contribution_cents: cents.nullish(),
  }),
  z.object({ op: z.literal('archive_goal'), id: uuid, archive: z.boolean() }),
  z.object({ op: z.literal('delete_goal'), id: uuid }),
  z.object({
    op: z.literal('create_contribution'),
    goal_id: uuid,
    amount_cents: cents,
    is_withdrawal: z.boolean(),
    occurred_on: isoDate,
    note: z.string().trim().nullish(),
  }),
  z.object({ op: z.literal('delete_contribution'), id: uuid }),

  z.object({
    op: z.literal('create_category'),
    name: z.string().trim().min(1).max(40),
    kind,
    color: z
      .string()
      .trim()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida')
      .nullish(),
  }),
  z.object({ op: z.literal('rename_category'), id: uuid, name: z.string().trim().min(1).max(40) }),
  z.object({ op: z.literal('archive_category'), id: uuid, archive: z.boolean() }),

  z.object({
    op: z.literal('create_scenario'),
    name: z.string().trim().min(1).max(60),
    starts_on: isoDate,
    ends_on: isoDate,
  }),
  z.object({ op: z.literal('rename_scenario'), id: uuid, name: z.string().trim().min(1).max(60) }),
  z.object({ op: z.literal('delete_scenario'), id: uuid }),
  z.object({ op: z.literal('activate_scenario'), id: uuid }),
  z.object({
    op: z.literal('create_scenario_entry'),
    scenario_id: uuid,
    kind,
    description: shortText,
    amount_cents: cents,
    occurs_on: isoDate,
  }),
  z.object({ op: z.literal('delete_scenario_entry'), id: uuid }),

  z.object({
    op: z.literal('update_balance_anchor'),
    opening_balance_cents: z.number().int().min(0).max(9_999_999_999),
    opening_balance_on: isoDate,
    is_negative: z.boolean(),
  }),
])

export type Operation = z.infer<typeof operationSchema>
export type OperationKind = Operation['op']

/** Operações que apagam dado. A tela as destaca; nunca somem sem confirmação. */
const DESTRUCTIVE: ReadonlySet<string> = new Set([
  'delete_entry',
  'delete_recurring',
  'delete_installment_plan',
  'delete_goal',
  'delete_contribution',
  'delete_scenario',
  'delete_scenario_entry',
])

export function isDestructive(op: Operation): boolean {
  return DESTRUCTIVE.has(op.op)
}

// ---------------------------------------------------------------------------
// Leitura da resposta do modelo
// ---------------------------------------------------------------------------

/** Um passo da resposta, como a Interactions API o devolve. */
const stepSchema = z.object({
  type: z.string(),
  name: z.string().optional(),
  arguments: z.unknown().optional(),
})

export interface ParsedProposal {
  operations: Operation[]
  /** O que o modelo não conseguiu virar operação válida — vira aviso na tela. */
  rejected: { name: string; reason: string }[]
}

/**
 * A resposta já traz chamada de ferramenta?
 *
 * Existe porque o status do provedor não é o sinal certo para saber se há o que
 * colher. Uma interação com ferramentas para em `requires_action` esperando o
 * resultado das chamadas — e este app nunca devolve resultado de ferramenta: ele
 * propõe a operação a uma pessoa. Então, para nós, o passo com `function_call` É o
 * fim da linha, e esperar `completed` é esperar por algo que não vem.
 *
 * Tolerante de propósito, no mesmo espírito de `parseFunctionCalls`: entrada torta
 * devolve `false` em vez de estourar.
 */
export function hasFunctionCall(steps: unknown): boolean {
  const parsed = z.array(stepSchema).safeParse(steps)
  if (!parsed.success) return false

  return parsed.data.some((step) => step.type === 'function_call' && Boolean(step.name))
}

/**
 * Transforma os `function_call` da resposta em operações validadas.
 *
 * Uma chamada malformada não derruba as demais: ela entra em `rejected` e a
 * tela avisa. O contrário — recusar tudo porque uma das três frases saiu torta
 * — faria a pessoa digitar de novo o que já estava certo.
 */
export function parseFunctionCalls(steps: unknown): ParsedProposal {
  const parsedSteps = z.array(stepSchema).safeParse(steps)
  if (!parsedSteps.success) return { operations: [], rejected: [] }

  const operations: Operation[] = []
  const rejected: { name: string; reason: string }[] = []

  for (const step of parsedSteps.data) {
    if (step.type !== 'function_call' || !step.name) continue

    // O modelo pode mandar os argumentos como objeto ou como string JSON.
    const rawArgs =
      typeof step.arguments === 'string' ? safeJsonParse(step.arguments) : step.arguments

    if (rawArgs === undefined || rawArgs === null || typeof rawArgs !== 'object') {
      rejected.push({ name: step.name, reason: 'argumentos ilegíveis' })
      continue
    }

    const candidate = { ...(rawArgs as Record<string, unknown>), op: step.name }
    const parsed = operationSchema.safeParse(candidate)

    if (parsed.success) {
      operations.push(parsed.data)
    } else {
      rejected.push({
        name: step.name,
        reason: parsed.error.issues[0]?.message ?? 'formato inesperado',
      })
    }
  }

  return { operations, rejected }
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

// ---------------------------------------------------------------------------
// O texto que a pessoa confirma
// ---------------------------------------------------------------------------

/** Nomes conhecidos, para a confirmação falar de "Aluguel" e não de um UUID. */
export interface LabelIndex {
  categories: Readonly<Record<string, string>>
  entries: Readonly<Record<string, string>>
  recurring: Readonly<Record<string, string>>
  installments: Readonly<Record<string, string>>
  goals: Readonly<Record<string, string>>
  scenarios: Readonly<Record<string, string>>
}

export const EMPTY_LABELS: LabelIndex = {
  categories: {},
  entries: {},
  recurring: {},
  installments: {},
  goals: {},
  scenarios: {},
}

/**
 * Data em `dd/mm/aaaa`, por fatiamento de string.
 *
 * Nunca via `new Date(iso)`: isso interpreta como UTC e, em fuso negativo,
 * mostra o dia anterior — é o bug do app antigo que o invariante 2 proíbe.
 */
export function formatISODateBR(iso: string): string {
  const [year, month, day] = iso.split('-')
  return year && month && day ? `${day}/${month}/${year}` : iso
}

const FREQUENCY_LABEL: Record<string, string> = {
  monthly: 'todo mês',
  weekly: 'toda semana',
  yearly: 'todo ano',
}

function label(index: Readonly<Record<string, string>>, id: string): string {
  return index[id] ?? 'registro não encontrado'
}

function categoryPart(op: Operation, labels: LabelIndex): string {
  if (!('category_id' in op)) return ''
  const name =
    op.category_name?.trim() ||
    (typeof op.category_id === 'string' ? labels.categories[op.category_id] : undefined)
  return name ? ` · ${name}` : ''
}

/**
 * A frase que aparece no cartão de confirmação.
 *
 * Objetivo único: deixar óbvio se a IA entendeu errado, antes de qualquer
 * escrita. Por isso mostra valor formatado, data por extenso e o nome do
 * registro alvo — não o id.
 */
export function describeOperation(op: Operation, labels: LabelIndex = EMPTY_LABELS): string {
  switch (op.op) {
    case 'create_entry': {
      const tipo = op.kind === 'expense' ? 'Registrar despesa' : 'Registrar receita'
      const estado = op.is_settled ? 'pago' : 'pendente'
      return `${tipo}: ${op.description}${categoryPart(op, labels)} · ${formatCents(op.amount_cents)} · ${formatISODateBR(op.occurred_on)} · ${estado}`
    }
    case 'update_entry': {
      const estado = op.is_settled ? 'pago' : 'pendente'
      return `Alterar o lançamento "${label(labels.entries, op.id)}" para: ${op.description}${categoryPart(op, labels)} · ${formatCents(op.amount_cents)} · ${formatISODateBR(op.occurred_on)} · ${estado}`
    }
    case 'delete_entry':
      return `Apagar o lançamento "${label(labels.entries, op.id)}"`
    case 'settle_entry':
      return op.is_settled
        ? `Marcar "${label(labels.entries, op.id)}" como pago`
        : `Voltar "${label(labels.entries, op.id)}" para pendente`

    case 'create_recurring':
    case 'update_recurring': {
      const verbo =
        op.op === 'create_recurring'
          ? op.kind === 'expense'
            ? 'Criar conta fixa'
            : 'Criar receita recorrente'
          : `Alterar a conta fixa "${label(labels.recurring, op.id)}" para`
      const quando =
        op.frequency === 'monthly' && op.day_of_month
          ? `todo dia ${op.day_of_month}`
          : (FREQUENCY_LABEL[op.frequency] ?? op.frequency)
      const fim = op.ends_on ? ` · até ${formatISODateBR(op.ends_on)}` : ''
      return `${verbo}: ${op.description}${categoryPart(op, labels)} · ${formatCents(op.amount_cents)} · ${quando} · a partir de ${formatISODateBR(op.starts_on)}${fim}`
    }
    case 'toggle_recurring_active':
      return op.is_active
        ? `Reativar a conta fixa "${label(labels.recurring, op.id)}"`
        : `Pausar a conta fixa "${label(labels.recurring, op.id)}"`
    case 'delete_recurring':
      return `Apagar a conta fixa "${label(labels.recurring, op.id)}"`
    case 'materialize_recurring':
      return `Marcar "${label(labels.recurring, op.rule_id)}" como pago em ${formatISODateBR(op.occurs_on)}`

    case 'create_installment_plan': {
      const parcela = Math.round(op.total_amount_cents / op.installments_count)
      return `Criar parcelamento: ${op.description}${categoryPart(op, labels)} · ${formatCents(op.total_amount_cents)} em ${op.installments_count}x de aproximadamente ${formatCents(parcela)} · primeira em ${formatISODateBR(op.first_due_on)}`
    }
    case 'delete_installment_plan':
      return `Apagar o parcelamento "${label(labels.installments, op.id)}" (as parcelas já pagas continuam no extrato)`

    case 'create_goal':
    case 'update_goal': {
      const verbo =
        op.op === 'create_goal'
          ? 'Criar meta'
          : `Alterar a meta "${label(labels.goals, op.id)}" para`
      const prazo = op.target_date ? ` · até ${formatISODateBR(op.target_date)}` : ''
      const aporte = op.monthly_contribution_cents
        ? ` · ${formatCents(op.monthly_contribution_cents)} por mês`
        : ''
      return `${verbo}: ${op.name} · ${formatCents(op.target_amount_cents)}${prazo}${aporte}`
    }
    case 'archive_goal':
      return op.archive
        ? `Arquivar a meta "${label(labels.goals, op.id)}"`
        : `Restaurar a meta "${label(labels.goals, op.id)}"`
    case 'delete_goal':
      return `Apagar a meta "${label(labels.goals, op.id)}" e todos os aportes dela`
    case 'create_contribution':
      return op.is_withdrawal
        ? `Tirar ${formatCents(op.amount_cents)} da meta "${label(labels.goals, op.goal_id)}" em ${formatISODateBR(op.occurred_on)}`
        : `Guardar ${formatCents(op.amount_cents)} na meta "${label(labels.goals, op.goal_id)}" em ${formatISODateBR(op.occurred_on)}`
    case 'delete_contribution':
      return 'Apagar um aporte de meta'

    case 'create_category':
      return `Criar categoria "${op.name}" (${op.kind === 'expense' ? 'despesa' : 'receita'})`
    case 'rename_category':
      return `Renomear a categoria "${label(labels.categories, op.id)}" para "${op.name}"`
    case 'archive_category':
      return op.archive
        ? `Arquivar a categoria "${label(labels.categories, op.id)}"`
        : `Restaurar a categoria "${label(labels.categories, op.id)}"`

    case 'create_scenario':
      return `Criar cenário "${op.name}" · de ${formatISODateBR(op.starts_on)} a ${formatISODateBR(op.ends_on)}`
    case 'rename_scenario':
      return `Renomear o cenário "${label(labels.scenarios, op.id)}" para "${op.name}"`
    case 'delete_scenario':
      return `Apagar o cenário "${label(labels.scenarios, op.id)}" (nenhum dado real é tocado)`
    case 'activate_scenario':
      return `Ativar o cenário "${label(labels.scenarios, op.id)}"`
    case 'create_scenario_entry':
      return `Adicionar ao cenário "${label(labels.scenarios, op.scenario_id)}" um item hipotético: ${op.description} · ${formatCents(op.amount_cents)} · ${formatISODateBR(op.occurs_on)}`
    case 'delete_scenario_entry':
      return 'Remover um item hipotético de cenário'

    case 'update_balance_anchor': {
      const sinal = op.is_negative ? '-' : ''
      return `Registrar que o saldo em ${formatISODateBR(op.opening_balance_on)} é ${sinal}${formatCents(op.opening_balance_cents)}`
    }
  }
}

// ---------------------------------------------------------------------------
// Tradução para FormData
// ---------------------------------------------------------------------------

/**
 * Qual Server Action executa cada operação.
 *
 * O teste cruza esta tabela com os `formData.get(...)` de `lib/actions/`: se um
 * campo for renomeado lá, o teste quebra aqui — em vez de a IA passar a falhar
 * em silêncio com "Dados inválidos".
 */
export const ACTION_FOR_OPERATION: Readonly<Record<OperationKind, string>> = {
  create_entry: 'createEntry',
  update_entry: 'updateEntry',
  delete_entry: 'deleteEntry',
  settle_entry: 'toggleSettled',
  create_recurring: 'createRecurring',
  update_recurring: 'updateRecurring',
  toggle_recurring_active: 'toggleRecurringActive',
  delete_recurring: 'deleteRecurring',
  materialize_recurring: 'materializeRecurring',
  create_installment_plan: 'createInstallmentPlan',
  delete_installment_plan: 'deleteInstallmentPlan',
  create_goal: 'createGoal',
  update_goal: 'updateGoal',
  archive_goal: 'archiveGoal',
  delete_goal: 'deleteGoal',
  create_contribution: 'createContribution',
  delete_contribution: 'deleteContribution',
  create_category: 'createCategory',
  rename_category: 'renameCategory',
  archive_category: 'archiveCategory',
  create_scenario: 'createScenario',
  rename_scenario: 'renameScenario',
  delete_scenario: 'deleteScenario',
  activate_scenario: 'activateScenario',
  create_scenario_entry: 'createScenarioEntry',
  delete_scenario_entry: 'deleteScenarioEntry',
  update_balance_anchor: 'updateBalanceAnchor',
}

/**
 * Monta o `FormData` que a action espera.
 *
 * Duas armadilhas que este código existe para não cair:
 *
 *  - **Tudo vai como string.** Vários schemas fazem
 *    `z.string().transform(v => v === '' ? null : Number(v))`; receber um número
 *    ali quebra o transform.
 *  - **Booleano é sempre explícito.** `archive`, `isActive`, `isWithdrawal` e o
 *    `isSettled` de `toggleSettled` usam `z.union([z.literal('true'),
 *    z.literal('false')])` — omitir não significa `false`, significa
 *    "Dados inválidos" sem dizer qual campo.
 *
 * `categoryId` entra resolvido de fora: quando a operação veio com
 * `category_name`, quem resolve o nome para o id da categoria recém-criada é
 * `apply.ts`, que sabe o que já foi executado nesta mesma proposta.
 */
export function operationToFormData(op: Operation, resolvedCategoryId?: string | null): FormData {
  const fd = new FormData()
  const put = (key: string, value: string | number | boolean | null | undefined): void => {
    if (value === null || value === undefined) return
    fd.set(key, String(value))
  }
  const putCategory = (): void => {
    const id =
      resolvedCategoryId !== undefined
        ? resolvedCategoryId
        : 'category_id' in op
          ? op.category_id
          : null
    // String vazia é o que o `<select>` sem escolha manda, e o schema a traduz
    // para null. Omitir também funciona, mas ser explícito documenta a intenção.
    fd.set('categoryId', id ?? '')
  }

  switch (op.op) {
    case 'create_entry':
    case 'update_entry':
      if (op.op === 'update_entry') put('id', op.id)
      put('kind', op.kind)
      put('amountCents', op.amount_cents)
      put('occurredOn', op.occurred_on)
      put('description', op.description)
      put('notes', op.notes ?? '')
      putCategory()
      // Aqui `isSettled` é o schema leniente: 'true'/'false' servem.
      put('isSettled', op.is_settled)
      break

    case 'delete_entry':
    case 'delete_recurring':
    case 'delete_installment_plan':
    case 'delete_goal':
    case 'delete_contribution':
    case 'delete_scenario':
    case 'delete_scenario_entry':
    case 'activate_scenario':
      put('id', op.id)
      break

    case 'settle_entry':
      put('id', op.id)
      put('isSettled', op.is_settled)
      break

    case 'create_recurring':
    case 'update_recurring':
      if (op.op === 'update_recurring') put('id', op.id)
      put('kind', op.kind)
      put('description', op.description)
      put('amountCents', op.amount_cents)
      putCategory()
      put('frequency', op.frequency)
      // Dia do mês só vale em regra mensal: o schema recusa a combinação.
      fd.set('dayOfMonth', op.frequency === 'monthly' && op.day_of_month ? String(op.day_of_month) : '')
      put('startsOn', op.starts_on)
      fd.set('endsOn', op.ends_on ?? '')
      break

    case 'toggle_recurring_active':
      put('id', op.id)
      put('isActive', op.is_active)
      break

    case 'materialize_recurring':
      put('ruleId', op.rule_id)
      put('occursOn', op.occurs_on)
      break

    case 'create_installment_plan':
      put('description', op.description)
      put('totalAmountCents', op.total_amount_cents)
      put('installmentsCount', op.installments_count)
      put('firstDueOn', op.first_due_on)
      putCategory()
      break

    case 'create_goal':
    case 'update_goal':
      if (op.op === 'update_goal') put('id', op.id)
      put('name', op.name)
      put('targetAmountCents', op.target_amount_cents)
      fd.set('targetDate', op.target_date ?? '')
      fd.set('monthlyContributionCents', op.monthly_contribution_cents
        ? String(op.monthly_contribution_cents)
        : '')
      break

    case 'archive_goal':
    case 'archive_category':
      put('id', op.id)
      put('archive', op.archive)
      break

    case 'create_contribution':
      put('goalId', op.goal_id)
      put('amountCents', op.amount_cents)
      put('isWithdrawal', op.is_withdrawal)
      put('occurredOn', op.occurred_on)
      fd.set('note', op.note ?? '')
      break

    case 'create_category':
      put('name', op.name)
      put('kind', op.kind)
      // Ausente faz o schema aplicar a cor padrão; string vazia não passaria.
      if (op.color) put('color', op.color)
      break

    case 'rename_category':
    case 'rename_scenario':
      put('id', op.id)
      put('name', op.name)
      break

    case 'create_scenario':
      put('name', op.name)
      put('startsOn', op.starts_on)
      put('endsOn', op.ends_on)
      break

    case 'create_scenario_entry':
      put('scenarioId', op.scenario_id)
      put('kind', op.kind)
      put('description', op.description)
      put('amountCents', op.amount_cents)
      put('occursOn', op.occurs_on)
      break

    case 'update_balance_anchor':
      put('openingBalanceCents', op.opening_balance_cents)
      put('openingBalanceOn', op.opening_balance_on)
      put('isNegative', op.is_negative)
      break
  }

  return fd
}
