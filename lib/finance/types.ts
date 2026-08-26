import type { ISODate } from './date'

export type EntryKind = 'expense' | 'income'
export type EntrySource = 'manual' | 'recurring' | 'installment' | 'goal'
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
}

export interface Goal {
  id: string
  name: string
  targetAmountCents: number
  targetDate: ISODate | null
  monthlyContributionCents: number | null
  savedCents: number
  archivedAt: string | null
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

export type OccurrenceOrigin = 'entry' | 'recurring' | 'goal' | 'scenario'

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
}

export interface ProjectRangeOptions {
  from: ISODate
  to: ISODate
  openingBalanceCents: number
  data: ProjectionData
  scenario?: Scenario
}
