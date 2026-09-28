import { z } from 'zod'
import { defaultFirstDue, type CreditAccountKind } from '@/lib/finance/credit'
import { isISODate } from '@/lib/finance/date'
import { formatCents } from '@/lib/finance/money'

/**
 * A proposta da IA: validação, texto de confirmação e tradução para FormData.
 * v1.2 — 2026-09-27.
 *
 * v1.2 (Fase 13 no assistente): o lançamento, a conta fixa e o parcelamento aprendem o "Pago
 * com" — `credit_account_id` e, no lançamento, a dívida (`charge_first_due_on`,
 * `charge_count`, `charge_total_cents`) —, e nasce `pay_credit_bill`, o botão "Pagar" da
 * fatura. Os nomes do FormData são os de `creditFieldsShape` (lib/validation/credit.ts), os
 * mesmos que o "Pago com" da tela manda. "Será pago em" omitido é o vencimento do ciclo da
 * conta (`defaultFirstDue`, a mesma regra do banco), preenchido por `withCreditDefaults` na
 * hora de mostrar e na hora de executar — nunca pelo modelo fazendo conta de calendário.
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

/**
 * v1.2 — 2026-09-27: de onde veio o dinheiro. **Ausente não é vazio**, como no formulário:
 * `undefined` não mexe (no `update_entry`, mantém o que está gravado); `null` ou `''` é "do
 * saldo"; um UUID é o cartão ou empréstimo. Sem `transform` de propósito: ele tornaria a
 * chave obrigatória no tipo de saída, e a ausência é justamente o caso que importa.
 */
const creditAccountRef = z
  .string()
  .trim()
  .nullish()
  .refine(
    (value) => value === null || value === undefined || value === '' || uuid.safeParse(value).success,
    'Cartão ou empréstimo inválido',
  )

/** v1.2 — 2026-09-27: a dívida de um lançamento pago com cartão/empréstimo. */
const creditCharge = {
  credit_account_id: creditAccountRef,
  /** "Será pago em". Ausente = o vencimento do ciclo da conta. */
  charge_first_due_on: optionalIsoDate,
  /** "Em quantas vezes" — só empréstimo; no cartão é sempre 1. */
  charge_count: z.number().int().min(1).max(360).nullish(),
  /** "Valor a pagar", com juros. Ausente = o mesmo valor. */
  charge_total_cents: cents.nullish(),
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
    ...creditCharge,
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
    ...creditCharge,
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
    // v1.2 — 2026-09-27: conta fixa no cartão (assinatura). Só cartão, só saída.
    credit_account_id: creditAccountRef,
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
    credit_account_id: creditAccountRef,
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
    // v1.2 — 2026-09-27: parcelado no cartão — cada parcela cai na fatura do mês dela.
    credit_account_id: creditAccountRef,
  }),
  z.object({ op: z.literal('delete_installment_plan'), id: uuid }),

  // v1.2 — 2026-09-27: pagar uma fatura (inteira ou parte), como o botão "Pagar" de /cartoes.
  // A fatura é identificada pela conta e pelo vencimento, os dois vindos do contexto.
  z.object({
    op: z.literal('pay_credit_bill'),
    account_id: uuid,
    due_on: isoDate,
    amount_cents: cents,
    paid_on: isoDate,
  }),

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

/**
 * v1.2 — 2026-09-27: um cartão ou empréstimo, com o ciclo — o bastante para dizer o nome na
 * confirmação e calcular o vencimento de uma compra sem ir ao banco (`withCreditDefaults`).
 */
export interface CreditLabel {
  name: string
  kind: CreditAccountKind
  closingDay: number | null
  dueDay: number | null
  dueOn: string | null
}

/** Nomes conhecidos, para a confirmação falar de "Aluguel" e não de um UUID. */
export interface LabelIndex {
  categories: Readonly<Record<string, string>>
  entries: Readonly<Record<string, string>>
  recurring: Readonly<Record<string, string>>
  installments: Readonly<Record<string, string>>
  goals: Readonly<Record<string, string>>
  scenarios: Readonly<Record<string, string>>
  /**
   * v1.2 — 2026-09-27: cartões e empréstimos, inclusive arquivados. Opcional porque os
   * pedidos gravados em `ai_jobs.input` antes desta versão não o têm.
   */
  credit?: Readonly<Record<string, CreditLabel>>
}

export const EMPTY_LABELS: LabelIndex = {
  categories: {},
  entries: {},
  recurring: {},
  installments: {},
  goals: {},
  scenarios: {},
  credit: {},
}

/**
 * Completa a dívida de um lançamento pago com cartão/empréstimo. v1.0 — 2026-09-27.
 *
 * - "Será pago em" ausente vira o vencimento do ciclo da conta, pela data do gasto — a regra
 *   de `defaultFirstDue`, a mesma do "Pago com" da tela e de `credit_first_due()` no banco. O
 *   modelo não faz conta de calendário: é o erro que o invariante 2 existe para não repetir.
 * - No cartão, "em quantas vezes" é sempre 1: compra parcelada no cartão é parcelamento.
 *
 * Conta desconhecida devolve a operação como veio; quem a recusa é `creditProblem`.
 */
export function withCreditDefaults(op: Operation, labels: LabelIndex = EMPTY_LABELS): Operation {
  if (op.op !== 'create_entry' && op.op !== 'update_entry') return op
  if (!op.credit_account_id) return op

  const account = labels.credit?.[op.credit_account_id]
  if (!account) return op

  const dueOn =
    op.charge_first_due_on ??
    defaultFirstDue(
      { kind: account.kind, closingDay: account.closingDay, dueDay: account.dueDay, dueOn: account.dueOn },
      op.occurred_on,
    )

  return {
    ...op,
    charge_first_due_on: dueOn,
    charge_count: account.kind === 'card' ? 1 : (op.charge_count ?? 1),
  }
}

/**
 * Por que esta operação com cartão/empréstimo não pode ser executada, ou `null` se pode.
 * v1.0 — 2026-09-27.
 *
 * Um id de conta que não está no contexto não vira "do saldo" em silêncio, como a categoria
 * inventada vira "sem categoria": registrar no saldo uma compra feita no cartão tiraria o
 * dinheiro da conta errada. Melhor recusar com uma frase.
 */
export function creditProblem(op: Operation, labels: LabelIndex = EMPTY_LABELS): string | null {
  const accountId =
    op.op === 'pay_credit_bill'
      ? op.account_id
      : 'credit_account_id' in op
        ? op.credit_account_id
        : null
  if (!accountId) return null

  const account = labels.credit?.[accountId]
  if (!account) return 'Cartão ou empréstimo não encontrado.'

  const cardOnly =
    op.op === 'create_recurring' || op.op === 'update_recurring' || op.op === 'create_installment_plan'
  if (cardOnly && account.kind !== 'card') {
    return 'Conta fixa e parcelamento só vão para cartão, não para empréstimo.'
  }
  if ((op.op === 'create_entry' || op.op === 'update_entry') && !op.charge_first_due_on) {
    return `Informe quando ${account.name} será pago.`
  }
  return null
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

function creditName(labels: LabelIndex, id: string): string {
  const account = labels.credit?.[id]
  if (!account) return 'conta não encontrada'
  return account.kind === 'card' ? `cartão ${account.name}` : `empréstimo ${account.name}`
}

/**
 * v1.2 — 2026-09-27: o "Pago com" na frase de confirmação. Vazio quando o dinheiro é do
 * saldo e a operação não mexe nisso; "do saldo" quando uma alteração tira do cartão.
 */
function creditPart(op: Operation, labels: LabelIndex): string {
  if (!('credit_account_id' in op) || op.credit_account_id === undefined) return ''
  if (!op.credit_account_id) return op.op === 'update_entry' ? ' · do saldo' : ''

  const nome = creditName(labels, op.credit_account_id)
  if (op.op !== 'create_entry' && op.op !== 'update_entry') return ` · no ${nome}`

  const origem = op.kind === 'expense' ? `no ${nome}` : `veio do ${nome}`
  const vezes = op.charge_count && op.charge_count > 1 ? op.charge_count : 1
  const quando = op.charge_first_due_on
    ? vezes > 1
      ? ` · em ${vezes}x, a primeira em ${formatISODateBR(op.charge_first_due_on)}`
      : ` · vence em ${formatISODateBR(op.charge_first_due_on)}`
    : ''
  const juros =
    op.charge_total_cents && op.charge_total_cents > op.amount_cents
      ? ` · ${formatCents(op.charge_total_cents - op.amount_cents)} de juros`
      : ''
  return ` · ${origem}${quando}${juros}`
}

/** v1.2 — 2026-09-27: a compra no cartão/empréstimo é paga pela fatura, não por ela mesma. */
function settledPart(op: Extract<Operation, { op: 'create_entry' | 'update_entry' }>): string {
  if (op.kind === 'expense' && op.credit_account_id) return 'paga pela fatura'
  return op.is_settled ? 'pago' : 'pendente'
}

/**
 * A frase que aparece no cartão de confirmação.
 *
 * Objetivo único: deixar óbvio se a IA entendeu errado, antes de qualquer
 * escrita. Por isso mostra valor formatado, data por extenso e o nome do
 * registro alvo — não o id.
 */
export function describeOperation(input: Operation, labels: LabelIndex = EMPTY_LABELS): string {
  // v1.2 — 2026-09-27: o vencimento que vai ser gravado aparece na frase, calculado do ciclo.
  const op = withCreditDefaults(input, labels)
  switch (op.op) {
    case 'create_entry': {
      const tipo = op.kind === 'expense' ? 'Registrar despesa' : 'Registrar receita'
      return `${tipo}: ${op.description}${categoryPart(op, labels)} · ${formatCents(op.amount_cents)} · ${formatISODateBR(op.occurred_on)}${creditPart(op, labels)} · ${settledPart(op)}`
    }
    case 'update_entry': {
      return `Alterar o lançamento "${label(labels.entries, op.id)}" para: ${op.description}${categoryPart(op, labels)} · ${formatCents(op.amount_cents)} · ${formatISODateBR(op.occurred_on)}${creditPart(op, labels)} · ${settledPart(op)}`
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
      return `${verbo}: ${op.description}${categoryPart(op, labels)} · ${formatCents(op.amount_cents)} · ${quando} · a partir de ${formatISODateBR(op.starts_on)}${fim}${creditPart(op, labels)}`
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
      return `Criar parcelamento: ${op.description}${categoryPart(op, labels)} · ${formatCents(op.total_amount_cents)} em ${op.installments_count}x de aproximadamente ${formatCents(parcela)} · primeira em ${formatISODateBR(op.first_due_on)}${creditPart(op, labels)}`
    }
    case 'delete_installment_plan':
      return `Apagar o parcelamento "${label(labels.installments, op.id)}" (as parcelas já pagas continuam no extrato)`

    case 'pay_credit_bill': {
      const account = labels.credit?.[op.account_id]
      const alvo = !account
        ? 'de uma fatura não encontrada'
        : account.kind === 'card'
          ? `da fatura do cartão ${account.name}`
          : `do empréstimo ${account.name}`
      return `Pagar ${formatCents(op.amount_cents)} ${alvo} que vence em ${formatISODateBR(op.due_on)} · pago em ${formatISODateBR(op.paid_on)}`
    }

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
  pay_credit_bill: 'payCreditBill',
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
      // v1.2 — 2026-09-27: o "Pago com". Ausente, o campo nem vai — e a action não mexe em de
      // onde veio o dinheiro; `''` é "do saldo" e zera a dívida.
      if (op.credit_account_id !== undefined) {
        fd.set('creditAccountId', op.credit_account_id || '')
        fd.set('chargeFirstDueOn', op.credit_account_id ? (op.charge_first_due_on ?? '') : '')
        fd.set('chargeCount', String(op.credit_account_id ? (op.charge_count ?? 1) : 1))
        fd.set(
          'chargeTotalCents',
          op.credit_account_id && op.charge_total_cents ? String(op.charge_total_cents) : '',
        )
      }
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
      // v1.2 — 2026-09-27: conta fixa no cartão. Ausente não mexe; `''` tira do cartão.
      if (op.credit_account_id !== undefined) fd.set('creditAccountId', op.credit_account_id || '')
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
      // v1.2 — 2026-09-27: parcelado no cartão.
      if (op.credit_account_id) put('creditAccountId', op.credit_account_id)
      break

    case 'pay_credit_bill':
      put('accountId', op.account_id)
      put('dueOn', op.due_on)
      put('amountCents', op.amount_cents)
      put('paidOn', op.paid_on)
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
