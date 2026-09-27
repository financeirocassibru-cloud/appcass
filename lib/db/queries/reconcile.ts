import type { EntryKind } from '@/lib/db/types'
import { addDays, type ISODate } from '@/lib/finance/date'
import { dedupeAgainstEntries } from '@/lib/finance/projection'
import { RECONCILE_WINDOW_DAYS, type ReconcileCandidate } from '@/lib/finance/reconcile'
import { expandRecurringRule } from '@/lib/finance/recurrence'
import type { Entry, RecurrenceFrequency, RecurringRule } from '@/lib/finance/types'
import { createClient } from '@/lib/supabase/server'

/**
 * O que a importação pode liquidar. v1.0 — 2026-09-27.
 *
 * Os itens cadastrados que ainda esperam acontecer, perto do período do extrato — o mesmo
 * conjunto que a agenda do Início mostra (`lib/db/queries/agenda.ts`), mais as metas:
 *
 * 1. **Lançamentos pendentes** (avulso digitado, parcela, conta fixa já materializada), com a
 *    palavra-chave do próprio lançamento, do plano (parcela) ou da regra (conta fixa). Avulso
 *    sem palavra-chave também vai: ele ainda casa por mesmo dia, tipo e valor exatos.
 * 2. **Ocorrências de conta/renda fixa** que ainda não viraram lançamento, expandidas pelo
 *    motor puro e deduplicadas com `dedupeAgainstEntries` — a mesma junção da projeção.
 * 3. **Metas** ativas com palavra-chave. Não vencem: cada linha que casa é um aporte.
 *
 * Sem filtro de usuário: quem restringe é a RLS (invariante 3). Item sem nenhuma palavra-chave
 * (fora o avulso) nem entra, e a lista fica pequena mesmo para quem tem muita conta.
 */

interface PendingRow {
  id: string
  kind: EntryKind
  occurred_on: string
  description: string
  amount_cents: number
  source: Entry['source']
  source_id: string | null
  keywords: string[]
}

interface RuleRow {
  id: string
  kind: EntryKind
  description: string
  amount_cents: number
  category_id: string | null
  frequency: RecurrenceFrequency
  day_of_month: number | null
  starts_on: string
  ends_on: string | null
  is_active: boolean
  keywords: string[]
}

/** Teto de sanidade: um extrato de um mês tem dezenas de pendências, não milhares. */
const LIMIT = 1000

export async function listReconcileCandidates(from: ISODate, to: ISODate): Promise<ReconcileCandidate[]> {
  const supabase = await createClient()
  const lo = addDays(from, -RECONCILE_WINDOW_DAYS)
  const hi = addDays(to, RECONCILE_WINDOW_DAYS)

  const [pendingResult, rulesResult, plansResult, goalsResult] = await Promise.all([
    supabase
      .from('entries')
      .select('id, kind, occurred_on, description, amount_cents, source, source_id, keywords')
      .eq('is_settled', false)
      .is('import_key', null)
      .neq('source', 'goal')
      .gte('occurred_on', lo)
      .lte('occurred_on', hi)
      .order('occurred_on')
      .limit(LIMIT),
    supabase
      .from('recurring_rules')
      .select(
        'id, kind, description, amount_cents, category_id, frequency, day_of_month, starts_on, ends_on, is_active, keywords',
      )
      .eq('is_active', true),
    supabase.from('installment_plans').select('id, keywords'),
    supabase
      .from('goals')
      .select('id, name, monthly_contribution_cents, keywords')
      .is('archived_at', null),
  ])

  for (const result of [pendingResult, rulesResult, plansResult, goalsResult]) {
    if (result.error) throw new Error(`Falha ao ler o que foi cadastrado: ${result.error.message}`)
  }

  const pending = (pendingResult.data ?? []) as PendingRow[]
  const rules = (rulesResult.data ?? []) as RuleRow[]
  const planKeywords = new Map((plansResult.data ?? []).map((p) => [p.id, p.keywords]))
  const ruleById = new Map(rules.map((r) => [r.id, r]))

  const candidates: ReconcileCandidate[] = []

  // 1. Pendentes reais.
  for (const e of pending) {
    const rule = e.source === 'recurring' && e.source_id ? ruleById.get(e.source_id) : undefined
    const keywords =
      e.source === 'installment'
        ? (e.source_id ? planKeywords.get(e.source_id) : undefined) ?? []
        : e.source === 'recurring'
          ? rule?.keywords ?? []
          : e.keywords
    if (keywords.length === 0 && e.source !== 'manual') continue

    candidates.push({
      target: 'entry',
      id: e.id,
      kind: e.kind,
      dueOn: e.occurred_on,
      amountCents: Number(e.amount_cents),
      keywords,
      label: e.description,
      origin:
        e.source === 'installment'
          ? 'parcela'
          : e.source === 'recurring'
            ? e.kind === 'income'
              ? 'renda fixa'
              : 'conta fixa'
            : 'avulso',
    })
  }

  // 2. Ocorrências previstas das regras com palavra-chave.
  const withKeywords = rules.filter((r) => r.keywords.length > 0)
  if (withKeywords.length > 0) {
    const expanded = withKeywords.flatMap((row) => expandRecurringRule(toRule(row), lo, hi))

    // O que já virou lançamento, pago ou não, pela chave — a data do lançamento pode ser a do
    // pagamento, e não a do vencimento, desde a 0019.
    const keys = [...new Set(expanded.map((o) => o.key.split(':')[2] ?? ''))].filter(Boolean)
    const materializedResult =
      keys.length === 0
        ? { data: [], error: null }
        : await supabase
            .from('entries')
            .select('id, source, source_id, occurrence_key')
            .eq('source', 'recurring')
            .in(
              'source_id',
              withKeywords.map((r) => r.id),
            )
            .in('occurrence_key', keys)
    if (materializedResult.error) {
      throw new Error(`Falha ao ler as contas fixas: ${materializedResult.error.message}`)
    }

    const materialized: Entry[] = (materializedResult.data ?? []).map((m) => ({
      id: m.id,
      kind: 'expense',
      occurredOn: '',
      description: '',
      amountCents: 0,
      categoryId: null,
      isSettled: false,
      source: m.source,
      sourceId: m.source_id,
      occurrenceKey: m.occurrence_key,
      installmentNumber: null,
      installmentTotal: null,
    }))

    for (const occurrence of dedupeAgainstEntries(expanded, materialized)) {
      const rule = occurrence.sourceId ? ruleById.get(occurrence.sourceId) : undefined
      if (!rule) continue
      candidates.push({
        target: 'recurring',
        id: rule.id,
        kind: rule.kind,
        dueOn: occurrence.date,
        amountCents: occurrence.amountCents,
        keywords: rule.keywords,
        label: rule.description,
        origin: rule.kind === 'income' ? 'renda fixa' : 'conta fixa',
      })
    }
  }

  // 3. Metas.
  for (const goal of goalsResult.data ?? []) {
    if (goal.keywords.length === 0) continue
    candidates.push({
      target: 'goal',
      id: goal.id,
      kind: 'expense',
      dueOn: null,
      amountCents: Number(goal.monthly_contribution_cents ?? 0),
      keywords: goal.keywords,
      label: `Meta: ${goal.name}`,
      origin: 'meta',
    })
  }

  return candidates
}

function toRule(row: RuleRow): RecurringRule {
  return {
    id: row.id,
    kind: row.kind,
    description: row.description,
    amountCents: Number(row.amount_cents),
    categoryId: row.category_id,
    frequency: row.frequency,
    dayOfMonth: row.day_of_month,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    isActive: row.is_active,
  }
}
