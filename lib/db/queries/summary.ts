import { startOfMonth, todayISO, type ISODate } from '@/lib/finance/date'
import {
  buildCommitment,
  buildMonthlySeries,
  categoryDeviation,
  lastMonthKeys,
  monthKeyOf,
  topCategories,
  type CategoryDeviation,
  type CategorySlice,
  type CommitmentMonth,
  type MonthKey,
  type MonthlyTotals,
  type SourceTotal,
} from '@/lib/finance/series'
import type { EntryKind } from '@/lib/db/types'
import { createClient } from '@/lib/supabase/server'

/**
 * Leitura das views de agregação, para os gráficos do Início.
 *
 * Diferente do saldo, aqui a soma **é** do banco: o gráfico de barras cobre seis
 * meses, e trazer todos os lançamentos desses meses para somar no servidor seria
 * desperdício. As views existem para isso.
 *
 * Um detalhe de tipo que a fase 3a já mostrou ser real: view não tem `not null`,
 * então tudo chega como `string | null` / `number | null`. A conversão para o
 * tipo do domínio acontece aqui, uma vez, e não espalhada pelos componentes.
 */

/** Quantos meses o gráfico de barras mostra. */
export const MONTHS_IN_CHART = 6
/** Períodos que a Análise oferece, em meses. */
export const ANALYSIS_MONTHS = [3, 6, 12] as const
export type AnalysisMonths = (typeof ANALYSIS_MONTHS)[number]
/** Fatias da rosca antes de agrupar a cauda em "Outros". */
const MAX_SLICES = 6

/**
 * Série mensal dos últimos meses, com mês vazio como zero.
 *
 * O filtro `gte` usa o primeiro dia do mês mais antigo da série: a coluna
 * `month` da view é o `date_trunc('month', ...)`, então sempre o dia 1º.
 */
export async function getMonthlySeries(
  today: ISODate = todayISO(),
  months: number = MONTHS_IN_CHART,
): Promise<MonthlyTotals[]> {
  const supabase = await createClient()

  const endMonth = monthKeyOf(today)
  const keys = lastMonthKeys(endMonth, months)
  const firstMonth = keys[0]
  if (!firstMonth) return []

  const { data, error } = await supabase
    .from('v_monthly_summary')
    .select('month, income_cents, expense_cents, net_cents')
    .gte('month', startOfMonth(`${firstMonth}-01`))
    .order('month', { ascending: true })

  if (error) throw new Error(`Falha ao ler o resumo mensal: ${error.message}`)

  const rows: MonthlyTotals[] = (data ?? [])
    .filter((row): row is typeof row & { month: string } => row.month !== null)
    .map((row) => ({
      month: monthKeyOf(row.month),
      incomeCents: Number(row.income_cents ?? 0),
      expenseCents: Number(row.expense_cents ?? 0),
      netCents: Number(row.net_cents ?? 0),
    }))

  return buildMonthlySeries(rows, endMonth, months)
}

export interface CategoryBreakdown {
  month: MonthKey
  slices: CategorySlice[]
  totalCents: number
}

/**
 * Saídas por categoria num mês.
 *
 * `kind = 'expense'`: a rosca responde "para onde foi o dinheiro", e misturar
 * receita nela não responde pergunta nenhuma. Lançamento sem categoria vira uma
 * fatia "Sem categoria" em vez de desaparecer — some do gráfico e a soma das
 * fatias deixa de fechar com o total do mês.
 */
export async function getCategoryBreakdown(
  today: ISODate = todayISO(),
  kind: EntryKind = 'expense',
): Promise<CategoryBreakdown> {
  const supabase = await createClient()

  const month = monthKeyOf(today)
  const monthStart = startOfMonth(today)

  const { data, error } = await supabase
    .from('v_category_breakdown')
    .select('category_id, category_name, category_color, total_cents')
    .eq('month', monthStart)
    .eq('kind', kind)

  if (error) throw new Error(`Falha ao ler as saídas por categoria: ${error.message}`)

  const slices: CategorySlice[] = (data ?? []).map((row) => ({
    categoryId: row.category_id,
    name: row.category_name ?? 'Sem categoria',
    color: row.category_color ?? '#94a3b8',
    totalCents: Number(row.total_cents ?? 0),
  }))

  // O total sai das fatias antes do corte: `topCategories` agrupa a cauda em
  // "Outros" sem perder centavo, então os dois números continuam batendo.
  const totalCents = slices.reduce((total, slice) => total + slice.totalCents, 0)

  return { month, slices: topCategories(slices, MAX_SLICES), totalCents }
}

/* ────────────────────────────────────────────────────────────────────────────
 * v1.1 — 2026-09-26: as leituras da tela de Análise.
 *
 * Todas trabalham em **meses fechados**, e não na janela arbitrária do gráfico. É deliberado:
 * comparar 17 dias de setembro com a média de meses inteiros acusaria queda em tudo, e somar
 * previsão ao "onde gastei" responderia a pergunta com o próprio palpite. O gráfico responde
 * "como vai ser"; esta seção responde "como foi".
 * ──────────────────────────────────────────────────────────────────────────── */

export interface AnalysisPeriod {
  months: MonthKey[]
  /** Os `months.length` meses imediatamente anteriores — a base de comparação. */
  baselineMonths: MonthKey[]
}

/** Os dois blocos de meses que a Análise compara: os N últimos e os N anteriores a eles. */
export function analysisPeriod(today: ISODate, months: number): AnalysisPeriod {
  const all = lastMonthKeys(monthKeyOf(today), months * 2)
  return { months: all.slice(months), baselineMonths: all.slice(0, months) }
}

interface MonthlyCategoryRow extends CategorySlice {
  month: MonthKey
}

/**
 * Totais por categoria, mês a mês, dentro do intervalo.
 *
 * `lte('month', ...)` existe por um motivo concreto: sem limite superior, um lançamento com
 * data futura — uma conta a pagar do mês que vem, que o app cria aos montes — entraria no
 * "como foi". O mesmo erro que `listRecentEntries` cometia e que fez nascer
 * `listEntriesInRange`.
 */
async function listCategoryTotalsByMonth(
  from: MonthKey,
  to: MonthKey,
  kind: EntryKind,
): Promise<MonthlyCategoryRow[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('v_category_breakdown')
    .select('month, category_id, category_name, category_color, total_cents')
    .eq('kind', kind)
    .gte('month', `${from}-01`)
    .lte('month', `${to}-01`)

  if (error) throw new Error(`Falha ao ler as categorias do período: ${error.message}`)

  return (data ?? [])
    .filter((row): row is typeof row & { month: string } => row.month !== null)
    .map((row) => ({
      month: monthKeyOf(row.month),
      categoryId: row.category_id,
      // Lançamento sem categoria vira uma fatia nomeada em vez de desaparecer: se sumisse, a
      // soma das fatias deixaria de fechar com o total.
      name: row.category_name ?? 'Sem categoria',
      color: row.category_color ?? '#94a3b8',
      totalCents: Number(row.total_cents ?? 0),
    }))
}

/** Soma as fatias de vários meses numa só, por categoria. */
function sumByCategory(rows: readonly MonthlyCategoryRow[]): CategorySlice[] {
  const byKey = new Map<string, CategorySlice>()
  for (const row of rows) {
    const key = row.categoryId ?? ''
    const current = byKey.get(key)
    if (current) current.totalCents += row.totalCents
    else byKey.set(key, { ...row })
  }
  return [...byKey.values()]
}

export interface CategoryPeriod {
  slices: CategorySlice[]
  totalCents: number
  monthCount: number
}

/** Saídas por categoria no período, já com a cauda agrupada em "Outros". */
export async function getCategoryTotalsForPeriod(
  period: AnalysisPeriod,
  kind: EntryKind = 'expense',
): Promise<CategoryPeriod> {
  const first = period.months[0]
  const last = period.months[period.months.length - 1]
  if (first === undefined || last === undefined) {
    return { slices: [], totalCents: 0, monthCount: 0 }
  }

  const slices = sumByCategory(await listCategoryTotalsByMonth(first, last, kind))
  // O total sai antes do corte: `topCategories` agrupa a cauda sem perder centavo, então os
  // dois números continuam batendo.
  const totalCents = slices.reduce((total, slice) => total + slice.totalCents, 0)

  return { slices: topCategories(slices, MAX_SLICES), totalCents, monthCount: period.months.length }
}

/** Quanto cada categoria fugiu do próprio padrão: o período contra os meses anteriores a ele. */
export async function getCategoryDeviation(
  period: AnalysisPeriod,
  kind: EntryKind = 'expense',
): Promise<CategoryDeviation[]> {
  const first = period.baselineMonths[0]
  const last = period.months[period.months.length - 1]
  if (first === undefined || last === undefined) return []

  // Uma leitura só cobre os dois blocos; separá-la em duas custaria uma ida a mais ao banco
  // para o mesmo índice.
  const rows = await listCategoryTotalsByMonth(first, last, kind)
  const inCurrent = new Set(period.months)

  return categoryDeviation(
    sumByCategory(rows.filter((row) => inCurrent.has(row.month))),
    sumByCategory(rows.filter((row) => !inCurrent.has(row.month))),
    { currentMonths: period.months.length, baselineMonths: period.baselineMonths.length },
  )
}

/** Comprometimento da renda, mês a mês, no período. */
export async function getCommitment(period: AnalysisPeriod): Promise<CommitmentMonth[]> {
  const first = period.months[0]
  const last = period.months[period.months.length - 1]
  if (first === undefined || last === undefined) return []

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('v_source_breakdown')
    .select('month, kind, source, total_cents')
    .gte('month', `${first}-01`)
    .lte('month', `${last}-01`)

  if (error) throw new Error(`Falha ao ler o comprometimento da renda: ${error.message}`)

  const rows: SourceTotal[] = (data ?? [])
    .filter((row): row is typeof row & { month: string } => row.month !== null)
    .map((row) => ({
      month: monthKeyOf(row.month),
      kind: row.kind as SourceTotal['kind'],
      source: row.source as SourceTotal['source'],
      totalCents: Number(row.total_cents ?? 0),
    }))

  return buildCommitment(rows, period.months)
}
