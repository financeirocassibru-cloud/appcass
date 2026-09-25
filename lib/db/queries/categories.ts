import type { CategoryKind } from '@/lib/db/types'
import { createClient } from '@/lib/supabase/server'

/**
 * Leitura de categorias.
 *
 * Nenhuma query repete `eq('user_id', ...)`: as policies de RLS já restringem as
 * linhas, e duplicar o filtro na aplicação passaria a impressão de que é ele que
 * protege — era exatamente assim que o app antigo errava. Escrita é outra
 * história: o `with check` da policy exige `user_id`, e quem preenche é a Server
 * Action, via `currentUserId()`.
 *
 * Coluna explícita em vez de `select('*')`: uma mudança de schema aparece no
 * typecheck em vez de virar `undefined` em tempo de execução.
 */

const COLUMNS = 'id, name, kind, color, icon, sort_order, archived_at' as const

export interface Category {
  id: string
  name: string
  kind: CategoryKind
  color: string
  icon: string | null
  sortOrder: number
  archivedAt: string | null
}

type Row = {
  id: string
  name: string
  kind: CategoryKind
  color: string
  icon: string | null
  sort_order: number
  archived_at: string | null
}

/** Converte a linha do banco (snake_case) para o domínio (camelCase). */
function toCategory(row: Row): Category {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    color: row.color,
    icon: row.icon,
    sortOrder: row.sort_order,
    archivedAt: row.archived_at,
  }
}

/** Categorias ativas, na ordem em que aparecem nos seletores. */
export async function listActiveCategories(kind?: CategoryKind): Promise<Category[]> {
  const supabase = await createClient()

  let query = supabase
    .from('categories')
    .select(COLUMNS)
    .is('archived_at', null)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (kind) query = query.eq('kind', kind)

  const { data, error } = await query
  if (error) throw new Error(`Falha ao listar categorias: ${error.message}`)

  return (data ?? []).map(toCategory)
}

/** Todas as categorias, inclusive arquivadas — para a tela de gestão. */
export async function listAllCategories(): Promise<Category[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('categories')
    .select(COLUMNS)
    .order('archived_at', { ascending: true, nullsFirst: true })
    .order('kind', { ascending: true })
    .order('sort_order', { ascending: true })

  if (error) throw new Error(`Falha ao listar categorias: ${error.message}`)

  return (data ?? []).map(toCategory)
}
