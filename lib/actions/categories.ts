'use server'

import { revalidatePath } from 'next/cache'
import { currentUserId } from '@/lib/db/current-user'
import { createClient } from '@/lib/supabase/server'
import {
  archiveCategorySchema,
  createCategorySchema,
  renameCategorySchema,
} from '@/lib/validation/entries'

export interface CategoryActionState {
  error?: string
  success?: string
}

function revalidateCategoryViews(): void {
  revalidatePath('/ajustes/categorias')
  revalidatePath('/lancamentos')
  revalidatePath('/novo')
}

export async function createCategory(
  _prev: CategoryActionState,
  formData: FormData,
): Promise<CategoryActionState> {
  const parsed = createCategorySchema.safeParse({
    name: formData.get('name'),
    kind: formData.get('kind'),
    color: formData.get('color') ?? undefined,
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  const userId = await currentUserId()
  const supabase = await createClient()

  const { error } = await supabase.from('categories').insert({
    user_id: userId,
    name: parsed.data.name,
    kind: parsed.data.kind,
    color: parsed.data.color,
  })

  if (error) {
    // 23505 é violação de unicidade: o índice `categories_user_name_kind_uniq`
    // impede duas categorias com o mesmo nome e tipo para a mesma pessoa.
    if (error.code === '23505') {
      return { error: 'Já existe uma categoria com esse nome.' }
    }
    return { error: `Não foi possível criar: ${error.message}` }
  }

  revalidateCategoryViews()
  return { success: 'Categoria criada.' }
}

export async function renameCategory(
  _prev: CategoryActionState,
  formData: FormData,
): Promise<CategoryActionState> {
  const parsed = renameCategorySchema.safeParse({
    id: formData.get('id'),
    name: formData.get('name'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('categories')
    .update({ name: parsed.data.name })
    .eq('id', parsed.data.id)
    .select('id')

  if (error) {
    if (error.code === '23505') return { error: 'Já existe uma categoria com esse nome.' }
    return { error: `Não foi possível renomear: ${error.message}` }
  }
  if (!data || data.length === 0) return { error: 'Categoria não encontrada.' }

  revalidateCategoryViews()
  return { success: 'Categoria renomeada.' }
}

/**
 * Arquiva ou restaura uma categoria.
 *
 * Arquivar, e não excluir: `entries.category_id` é `on delete set null`, então
 * apagar a categoria apagaria a classificação de todo lançamento passado que a
 * usava. Arquivada, ela sai dos seletores e continua nomeando o histórico.
 */
export async function archiveCategory(
  _prev: CategoryActionState,
  formData: FormData,
): Promise<CategoryActionState> {
  const parsed = archiveCategorySchema.safeParse({
    id: formData.get('id'),
    archive: formData.get('archive'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('categories')
    .update({ archived_at: parsed.data.archive ? new Date().toISOString() : null })
    .eq('id', parsed.data.id)
    .select('id')

  if (error) return { error: `Não foi possível atualizar: ${error.message}` }
  if (!data || data.length === 0) return { error: 'Categoria não encontrada.' }

  revalidateCategoryViews()
  return { success: parsed.data.archive ? 'Categoria arquivada.' : 'Categoria restaurada.' }
}
