import type { ISODate } from '@/lib/finance/date'
import type { Goal } from '@/lib/finance/types'
import { createClient } from '@/lib/supabase/server'

/**
 * Leitura de metas.
 *
 * O progresso vem de `v_goal_progress`, que soma `goal_contributions` —
 * invariante 7, estado derivado é derivado. O app antigo guardava o valor
 * acumulado num campo e ele descolava da realidade no primeiro aporte editado
 * por fora.
 *
 * Como toda view, ela não tem `not null`: os totais chegam como `number | null`
 * e a conversão acontece aqui, uma vez.
 */

export interface GoalProgress extends Goal {
  /** Quanto falta, nunca negativo — a view já aplica o `greatest`. */
  remainingCents: number
  /** 0 a 100, com duas casas. */
  pct: number
}

interface ViewRow {
  goal_id: string | null
  name: string | null
  target_amount_cents: number | null
  target_date: string | null
  saved_cents: number | null
  remaining_cents: number | null
  pct: number | null
}

const VIEW_COLUMNS =
  'goal_id, name, target_amount_cents, target_date, saved_cents, remaining_cents, pct' as const

/**
 * Metas com progresso.
 *
 * `monthlyContributionCents` e `archivedAt` não estão na view, então vêm da
 * tabela numa segunda consulta e são casados por id. Alternativa seria alterar
 * a view — mas ela já foi aplicada (invariante 16), e o custo aqui é uma
 * consulta a mais sobre uma tabela pequena.
 */
export async function listGoals(includeArchived = false): Promise<GoalProgress[]> {
  const supabase = await createClient()

  const [progress, details] = await Promise.all([
    supabase.from('v_goal_progress').select(VIEW_COLUMNS),
    supabase.from('goals').select('id, monthly_contribution_cents, archived_at, created_at'),
  ])

  if (progress.error) throw new Error(`Falha ao listar metas: ${progress.error.message}`)
  if (details.error) throw new Error(`Falha ao listar metas: ${details.error.message}`)

  const byId = new Map((details.data ?? []).map((row) => [row.id, row]))

  const goals = (progress.data ?? [])
    .filter((row): row is ViewRow & { goal_id: string } => row.goal_id !== null)
    .map((row) => {
      const detail = byId.get(row.goal_id)
      return toGoal(
        row,
        detail?.monthly_contribution_cents ?? null,
        detail?.archived_at ?? null,
      )
    })

  const visible = includeArchived ? goals : goals.filter((goal) => goal.archivedAt === null)

  // Concluídas por último: o que ainda exige aporte é o que interessa ver.
  // A ordem de desempate é a de criação, que vem da tabela e não da view.
  const createdAt = new Map(
    (details.data ?? []).map((row) => [row.id, row.created_at] as const),
  )

  return visible.sort((a, b) => {
    const aDone = a.remainingCents === 0 ? 1 : 0
    const bDone = b.remainingCents === 0 ? 1 : 0
    if (aDone !== bDone) return aDone - bDone
    return (createdAt.get(a.id) ?? '') < (createdAt.get(b.id) ?? '') ? 1 : -1
  })
}

export async function getGoal(id: string): Promise<GoalProgress | null> {
  const supabase = await createClient()

  const [progress, detail] = await Promise.all([
    supabase.from('v_goal_progress').select(VIEW_COLUMNS).eq('goal_id', id).maybeSingle(),
    supabase
      .from('goals')
      .select('monthly_contribution_cents, archived_at')
      .eq('id', id)
      .maybeSingle(),
  ])

  if (progress.error) throw new Error(`Falha ao buscar meta: ${progress.error.message}`)
  if (detail.error) throw new Error(`Falha ao buscar meta: ${detail.error.message}`)
  if (!progress.data || progress.data.goal_id === null) return null

  return toGoal(
    progress.data as ViewRow & { goal_id: string },
    detail.data?.monthly_contribution_cents ?? null,
    detail.data?.archived_at ?? null,
  )
}

function toGoal(
  row: ViewRow & { goal_id: string },
  monthlyContributionCents: number | null,
  archivedAt: string | null,
): GoalProgress {
  return {
    id: row.goal_id,
    name: row.name ?? '',
    targetAmountCents: Number(row.target_amount_cents ?? 0),
    targetDate: row.target_date,
    monthlyContributionCents:
      monthlyContributionCents === null ? null : Number(monthlyContributionCents),
    savedCents: Number(row.saved_cents ?? 0),
    archivedAt,
    remainingCents: Number(row.remaining_cents ?? 0),
    pct: Number(row.pct ?? 0),
  }
}

/** Um aporte no histórico da meta. */
export interface Contribution {
  id: string
  amountCents: number
  occurredOn: ISODate
  note: string | null
}

/**
 * Aportes de uma meta, do mais recente para o mais antigo.
 *
 * O valor pode ser **negativo**: tirar dinheiro da meta é um aporte negativo, e
 * não a exclusão de um aporte antigo. Apagar o que entrou para representar o
 * que saiu perderia a história — e o saldo da meta continua sendo a soma,
 * qualquer que seja o sinal das parcelas.
 */
export async function listContributions(goalId: string): Promise<Contribution[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('goal_contributions')
    .select('id, amount_cents, occurred_on, note')
    .eq('goal_id', goalId)
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Falha ao listar aportes: ${error.message}`)

  return (data ?? []).map((row) => ({
    id: row.id,
    amountCents: Number(row.amount_cents),
    occurredOn: row.occurred_on,
    note: row.note,
  }))
}

/** Metas ativas na forma que o motor de projeção consome. */
export async function listGoalsForProjection(): Promise<Goal[]> {
  const goals = await listGoals(false)

  // `expandGoal` já descarta meta arquivada e meta cumprida; o filtro de
  // arquivadas acima só evita trazê-las do banco à toa.
  return goals.map((goal) => ({
    id: goal.id,
    name: goal.name,
    targetAmountCents: goal.targetAmountCents,
    targetDate: goal.targetDate,
    monthlyContributionCents: goal.monthlyContributionCents,
    savedCents: goal.savedCents,
    archivedAt: goal.archivedAt,
  }))
}
