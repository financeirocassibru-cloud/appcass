import type { ISODate } from './date'

export type EntryKind = 'expense' | 'income'
// v1.2 — 2026-09-27 (Fase 13): `credit_bill` (pagamento da fatura) e `credit_carry`
// (parcelamento da fatura) — migration 0020.
export type EntrySource =
  | 'manual'
  | 'recurring'
  | 'installment'
  | 'goal'
  | 'credit_bill'
  | 'credit_carry'
export type RecurrenceFrequency = 'monthly' | 'weekly' | 'yearly'
export type OverrideTarget = 'entry' | 'recurring_rule' | 'installment_plan' | 'goal'

/** Lançamento real, já materializado em `entries`. */
export interface Entry {
  id: string
  kind: EntryKind
  occurredOn: ISODate
  description: string
  amountCents: number
  categoryId: string | null
  isSettled: boolean
  source: EntrySource
  sourceId: string | null
  occurrenceKey: string | null
  installmentNumber: number | null
  installmentTotal: number | null
  // v1.2 — 2026-09-27 (Fase 13): de onde veio o dinheiro, quando não foi do saldo, e como a
  // dívida é paga. Opcionais para que quem não lê a conta (testes antigos, IA) continue igual:
  // ausente é o mesmo que nulo — lançamento do saldo. Ver lib/finance/credit.ts.
  creditAccountId?: string | null
  chargeFirstDueOn?: ISODate | null
  chargeCount?: number
  interestCents?: number
}

/** Custo fixo ou renda recorrente. Uma regra, não um lançamento. */
export interface RecurringRule {
  id: string
  kind: EntryKind
  description: string
  amountCents: number
  categoryId: string | null
  frequency: RecurrenceFrequency
  dayOfMonth: number | null
  startsOn: ISODate
  endsOn: ISODate | null
  isActive: boolean
  /** v1.2 — 2026-09-27 (Fase 13): conta fixa no cartão — cobrada na fatura, não no saldo. */
  creditAccountId?: string | null
}

export interface Goal {
  id: string
  name: string
  targetAmountCents: number
  targetDate: ISODate | null
  monthlyContributionCents: number | null
  savedCents: number
  archivedAt: string | null
  /**
   * v1.1 — 28/09/2026 (Fase 14, migration 0023): o aporte previsto que a pessoa fixou para um mês
   * ("Só este mês" na planilha). `month` é o 1º dia do mês. Ausente = nenhum.
   */
  planOverrides?: readonly GoalPlanOverride[]
}

/** v1.1 — 28/09/2026: um mês de meta com valor fixado (`goal_plan_overrides`). */
export interface GoalPlanOverride {
  month: ISODate
  amountCents: number
}

/** Desvio de um cenário sobre um dado real. Nunca uma cópia dele. */
export interface ScenarioOverride {
  targetType: OverrideTarget
  targetId: string
  /** `null` vale para todas as ocorrências do alvo. */
  occurrenceKey: string | null
  isIncluded: boolean
  amountCentsOverride: number | null
  dateOverride: ISODate | null
}

/** Item hipotético que só existe dentro do cenário. */
export interface ScenarioEntry {
  id: string
  kind: EntryKind
  description: string
  amountCents: number
  occursOn: ISODate
  categoryId: string | null
}

export interface Scenario {
  id: string
  name: string
  startsOn: ISODate
  endsOn: ISODate
  openingBalanceCents: number
  overrides: readonly ScenarioOverride[]
  entries: readonly ScenarioEntry[]
}

// v1.2 — 2026-09-27 (Fase 13): `credit_bill` é a fatura ainda não paga, derivada das compras.
export type OccurrenceOrigin = 'entry' | 'recurring' | 'goal' | 'scenario' | 'credit_bill'

/** Um evento financeiro num dia, real ou projetado. */
export interface Occurrence {
  /** Estável entre renderizações; serve de React key. */
  key: string
  date: ISODate
  kind: EntryKind
  amountCents: number
  description: string
  origin: OccurrenceOrigin
  sourceId: string | null
  categoryId: string | null
  /** `true` quando já existe como linha em `entries`. */
  isRealized: boolean
  isSettled: boolean
}

export interface DayProjection {
  date: ISODate
  occurrences: Occurrence[]
  inflowCents: number
  outflowCents: number
  /** Saldo acumulado ao fim do dia. */
  balanceCents: number
}

/** Tudo que o motor precisa ler. Quem monta isto é a camada de query. */
export interface ProjectionData {
  entries: readonly Entry[]
  recurringRules: readonly RecurringRule[]
  goals: readonly Goal[]
  /**
   * v1.2 — 2026-09-27 (Fase 13): as faturas de cartão/empréstimo já montadas por
   * `buildBills` (lib/finance/credit.ts). O restante de cada uma é a saída de caixa prevista
   * no vencimento — é por ela, e não pelas compras, que o gasto no cartão sai do saldo.
   */
  creditBills?: readonly CreditBillLike[]
}

/**
 * O mínimo de uma fatura que a projeção precisa. O tipo completo mora em
 * lib/finance/credit.ts; este existe para `types.ts` não importar de lá (credit.ts importa
 * daqui).
 */
export interface CreditBillLike {
  accountId: string
  accountName: string
  accountKind: 'card' | 'loan'
  dueOn: ISODate
  remainingCents: number
  /** Só `open`, `closed`, `overdue` e `partial` ainda são devidas no próprio vencimento. */
  status: 'open' | 'closed' | 'overdue' | 'partial' | 'paid' | 'rolled' | 'carried'
}

export interface ProjectRangeOptions {
  from: ISODate
  to: ISODate
  openingBalanceCents: number
  data: ProjectionData
  scenario?: Scenario
}

/**
 * v1.1 — 2026-09-26: opções de `projectWindow`, a projeção que atravessa passado e futuro.
 *
 * Difere de `ProjectRangeOptions` em duas coisas, e as duas são a razão de existir um tipo
 * separado em vez de um campo opcional: `today` é obrigatório, porque é a fronteira entre
 * fato e previsão; e `data.entries` são os lançamentos **crus**, porque a partição depende da
 * janela e quem a faz é a própria função.
 */
export interface ProjectWindowOptions {
  from: ISODate
  to: ISODate
  /** A fronteira entre o que aconteceu e o que está previsto. */
  today: ISODate
  /** Saldo no fim do dia anterior a `from`. */
  openingBalanceCents: number
  /** Lançamentos crus: **não** passe o resultado de `entriesAheadOf`. */
  data: ProjectionData
  scenario?: Scenario
}
