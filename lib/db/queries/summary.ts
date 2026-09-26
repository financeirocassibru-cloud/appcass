import { startOfMonth, todayISO, type ISODate } from '@/lib/finance/date'
import {
  buildMonthlySeries,
  lastMonthKeys,
  monthKeyOf,
  topCategories,
  type CategorySlice,
  type MonthKey,
  type MonthlyTotals,
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
