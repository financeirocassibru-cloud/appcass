import { addDays, compareISO, parseISODate, type ISODate } from './date'

/**
 * Separação da agenda em atrasados e próximos.
 *
 * O `getUpcomingEvents()` do app antigo dependia de existir um ciclo ativo, e
 * quando não existia a lista sumia inteira, sem aviso — a pessoa achava que não
 * tinha nada vencendo (`legacy/…/Index.html.md:1991`). Aqui a separação é uma
 * função pura sobre a lista de pendentes: se a lista chega vazia, o vazio é uma
 * resposta, não um silêncio.
 *
 * `today` entra por parâmetro (invariante 9): sem isso o teste passaria hoje e
 * falharia amanhã.
 */

/**
 * Um item da agenda, venha ele de onde vier.
 *
 * A agenda mistura duas coisas que a pessoa lê igual mas o sistema trata
 * diferente:
 *
 * - **`entry`** — lançamento que já existe como linha em `entries`. Liquidar é
 *   um `update`.
 * - **`recurring`** — ocorrência de uma conta fixa que ainda **não** virou
 *   lançamento. Liquidar é materializar: cria a linha pela função
 *   `materialize_recurring_occurrence` da migration 0009.
 *
 * O discriminante `source` existe para a tela escolher a ação certa. Tudo o que
 * ela precisa para **desenhar** a linha está nos campos comuns, então o
 * componente não ramifica para renderizar — só para agir.
 *
 * Parcelas não aparecem como um terceiro caso: as parcelas já são `entries`
 * reais desde a criação do plano, então chegam aqui como `entry`.
 */
interface AgendaItemBase {
  occurredOn: ISODate
  amountCents: number
  kind: 'expense' | 'income'
  description: string
  categoryName: string | null
}

export interface AgendaEntryItem extends AgendaItemBase {
  source: 'entry'
  /** `entries.id` — o alvo do `toggleSettled`. */
  id: string
}

export interface AgendaRecurringItem extends AgendaItemBase {
  source: 'recurring'
  /** `recurring_rules.id` — o alvo da materialização. */
  ruleId: string
  /** Estável entre renderizações; serve de React key. */
  key: string
}

export type AgendaItem = AgendaEntryItem | AgendaRecurringItem

/** A chave de React de um item, qualquer que seja a origem. */
export function agendaItemKey(item: AgendaItem): string {
  return item.source === 'entry' ? `entry:${item.id}` : item.key
}

export interface AgendaSplit<T> {
  /** Vencidos, do mais antigo para o mais recente: o mais atrasado primeiro. */
  overdue: T[]
  /** De hoje até o horizonte, em ordem de vencimento. */
  upcoming: T[]
  /** Subconjunto de `upcoming` que vence hoje — o destaque da tela. */
  dueToday: T[]
}

export const DEFAULT_HORIZON_DAYS = 30

/**
 * Divide pendentes em atrasados e próximos.
 *
 * O que vence depois do horizonte fica de fora: a agenda responde "o que exige
 * atenção agora", e uma lista de tudo o que existe não responde nada.
 */
export function splitAgenda<T extends { occurredOn: ISODate }>(
  items: readonly T[],
  today: ISODate,
  horizonDays: number = DEFAULT_HORIZON_DAYS,
): AgendaSplit<T> {
  parseISODate(today)
  const horizon = addDays(today, horizonDays)

  const overdue: T[] = []
  const upcoming: T[] = []
  const dueToday: T[] = []

  for (const item of items) {
    parseISODate(item.occurredOn)

    if (item.occurredOn < today) {
      overdue.push(item)
      continue
    }
    if (item.occurredOn > horizon) continue

    upcoming.push(item)
    if (item.occurredOn === today) dueToday.push(item)
  }

  const byDate = (a: T, b: T) => compareISO(a.occurredOn, b.occurredOn)
  overdue.sort(byDate)
  upcoming.sort(byDate)

  return { overdue, upcoming, dueToday }
}

/** Soma de valores de uma fatia da agenda — o total em atraso, por exemplo. */
export function sumAgendaCents(items: readonly { amountCents: number }[]): number {
  return items.reduce((total, item) => total + item.amountCents, 0)
}

/**
 * Quantos dias de atraso. Positivo sempre; zero quando vence hoje ou no futuro.
 *
 * Monta os dois dias como meia-noite UTC e subtrai — o mesmo recurso de
 * `formatDayLabel`. Construir em UTC a partir dos componentes já validados não
 * envolve o fuso da máquina em nenhum ponto, então a conta dá o mesmo número em
 * qualquer servidor.
 */
export function daysOverdue(occurredOn: ISODate, today: ISODate): number {
  if (occurredOn >= today) return 0

  const due = parseISODate(occurredOn)
  const now = parseISODate(today)
  const diffMs =
    Date.UTC(now.year, now.month - 1, now.day) - Date.UTC(due.year, due.month - 1, due.day)

  return Math.round(diffMs / 86_400_000)
}
