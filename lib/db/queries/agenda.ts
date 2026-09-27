import { getCreditLedger } from '@/lib/db/queries/credit'
import { listPendingEntries, type EntryWithCategory } from '@/lib/db/queries/entries'
import { listActiveRecurringRules } from '@/lib/db/queries/recurring'
import type { AgendaItem } from '@/lib/finance/agenda'
import { billLabel, isBillDue } from '@/lib/finance/credit'
import { addDays, todayISO, type ISODate } from '@/lib/finance/date'
import { dedupeAgainstEntries } from '@/lib/finance/projection'
import { expandRecurringRule } from '@/lib/finance/recurrence'
import type { Entry } from '@/lib/finance/types'
import { createClient } from '@/lib/supabase/server'

/**
 * A agenda do Início: o que vence, venha de onde vier.
 *
 * Junta duas origens que a pessoa lê como uma lista só:
 *
 * 1. **Lançamentos pendentes reais** — inclusive as parcelas, que já são
 *    `entries` desde a criação do plano e portanto não precisam de expansão.
 * 2. **Ocorrências de contas fixas** que ainda não viraram lançamento,
 *    expandidas pelo motor puro de `lib/finance/recurrence.ts`.
 *
 * E deduplica: a conta fixa já materializada aparece pela origem 1, e a
 * ocorrência prevista correspondente tem de sumir. Quem faz isso é
 * `dedupeAgainstEntries`, a mesma função que a projeção usa — se a chave fosse
 * montada em dois lugares, divergiriam e o aluguel apareceria duas vezes, que é
 * exatamente o bug do app antigo.
 *
 * v1.1 — 2026-09-27 (Fase 13): e uma terceira, as **faturas** de cartão e empréstimo ainda
 * devidas. A compra no cartão e a conta fixa no cartão ficam de fora — quem vence é a fatura
 * que as soma, e mostrar as duas seria cobrar o mesmo gasto duas vezes.
 *
 * A expansão acontece **sempre**, e não só quando existe cenário ativo. O
 * `getUpcomingEvents()` antigo dependia de haver ciclo; sem ciclo a lista sumia
 * inteira, sem aviso.
 */

/**
 * Quanto a agenda olha para trás ao expandir.
 *
 * Uma conta fixa esquecida precisa aparecer como atrasada em vez de
 * desaparecer por ter vencido. Um ano cobre o caso real sem transformar a
 * expansão numa varredura sem fim desde `starts_on`.
 */
const LOOKBACK_DAYS = 365

const MATERIALIZED_COLUMNS = `
  id, kind, occurred_on, description, amount_cents, category_id,
  is_settled, source, source_id, occurrence_key,
  installment_number, installment_total
` as const

export async function getAgendaItems(
  today: ISODate = todayISO(),
  horizonDays = 30,
): Promise<AgendaItem[]> {
  const horizon = addDays(today, horizonDays)
  const expandFrom = addDays(today, -LOOKBACK_DAYS)

  const [pending, allRules, materialized, ledger] = await Promise.all([
    listPendingEntries(horizon),
    listActiveRecurringRules(),
    listMaterializedRecurring(expandFrom, horizon),
    getCreditLedger(today),
  ])
  // v1.1 — 2026-09-27: a conta fixa no cartão é cobrada na fatura.
  const rules = allRules.filter((rule) => !rule.creditAccountId)

  const projected = rules.flatMap((rule) =>
    expandRecurringRule(rule, expandFrom, horizon).map((occurrence) => ({
      occurrence,
      categoryName: rule.categoryName,
    })),
  )

  // `dedupeAgainstEntries` casa pela chave da ocorrência, então o objeto
  // carregado precisa expô-la no topo.
  const deduped = dedupeAgainstEntries(
    projected.map((item) => ({ ...item, key: item.occurrence.key })),
    materialized,
  )

  return [
    ...pending.map(toEntryItem),
    ...deduped.map(({ occurrence, categoryName }) => ({
      source: 'recurring' as const,
      ruleId: occurrence.sourceId ?? '',
      key: occurrence.key,
      occurredOn: occurrence.date,
      amountCents: occurrence.amountCents,
      kind: occurrence.kind,
      description: occurrence.description,
      categoryName,
    })),
    ...ledger.bills
      .filter((bill) => isBillDue(bill) && bill.dueOn <= horizon)
      .map((bill) => ({
        source: 'credit_bill' as const,
        accountId: bill.accountId,
        dueOn: bill.dueOn,
        key: `bill:${bill.accountId}:${bill.dueOn}`,
        occurredOn: bill.dueOn,
        amountCents: bill.remainingCents,
        kind: 'expense' as const,
        description: billLabel(bill),
        categoryName: null,
      })),
  ]
}

function toEntryItem(entry: EntryWithCategory): AgendaItem {
  return {
    source: 'entry',
    id: entry.id,
    occurredOn: entry.occurredOn,
    amountCents: entry.amountCents,
    kind: entry.kind,
    description: entry.description,
    categoryName: entry.category?.name ?? null,
  }
}

/**
 * Lançamentos gerados por conta fixa no intervalo, **liquidados ou não**.
 *
 * Separado de `listPendingEntries` por um motivo fácil de não enxergar: a
 * agenda só busca pendentes, mas a deduplicação precisa ver os liquidados
 * também. Sem isso a ocorrência que a pessoa acabou de pagar voltaria para a
 * agenda como prevista, e pagar de novo seria o caminho natural.
 */
async function listMaterializedRecurring(from: ISODate, to: ISODate): Promise<Entry[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('entries')
    .select(MATERIALIZED_COLUMNS)
    .eq('source', 'recurring')
    .gte('occurred_on', from)
    .lte('occurred_on', to)

  if (error) throw new Error(`Falha ao ler ocorrências materializadas: ${error.message}`)

  return (data ?? []).map((row) => ({
    id: row.id,
    kind: row.kind,
    occurredOn: row.occurred_on,
    description: row.description,
    amountCents: Number(row.amount_cents),
    categoryId: row.category_id,
    isSettled: row.is_settled,
    source: row.source,
    sourceId: row.source_id,
    occurrenceKey: row.occurrence_key,
    installmentNumber: row.installment_number,
    installmentTotal: row.installment_total,
  }))
}
