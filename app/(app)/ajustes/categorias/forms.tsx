'use client'

import { useActionState, useState } from 'react'
import { Archive, ArchiveRestore, Pencil } from 'lucide-react'
import {
  archiveCategory,
  createCategory,
  renameCategory,
  type CategoryActionState,
} from '@/lib/actions/categories'
import type { Category } from '@/lib/db/queries/categories'
import { FormMessage } from '@/components/auth/form-field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const initialState: CategoryActionState = {}

export function NewCategoryForm() {
  const [state, formAction, pending] = useActionState(createCategory, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="campo-nova-categoria">Nova categoria</Label>
        <Input
          id="campo-nova-categoria"
          name="name"
          required
          maxLength={40}
          placeholder="Academia"
          className="min-h-11 text-base"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="campo-tipo-categoria">Tipo</Label>
        <select
          id="campo-tipo-categoria"
          name="kind"
          defaultValue="expense"
          className="border-input bg-card focus-visible:border-primary min-h-11 rounded-lg border px-3 text-base outline-none"
        >
          <option value="expense">Saída</option>
          <option value="income">Entrada</option>
        </select>
      </div>

      <FormMessage error={state.error} success={state.success} />

      <Button type="submit" disabled={pending} className="min-h-11 text-base">
        {pending ? 'Criando…' : 'Criar categoria'}
      </Button>
    </form>
  )
}

export function CategoryList({ title, categories }: { title: string; categories: Category[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      {categories.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nenhuma.</p>
      ) : (
        <ul className="divide-border flex flex-col divide-y">
          {categories.map((category) => (
            <CategoryItem key={category.id} category={category} />
          ))}
        </ul>
      )}
    </section>
  )
}

function CategoryItem({ category }: { category: Category }) {
  const [editing, setEditing] = useState(false)
  const [renameState, renameAction, renaming] = useActionState(renameCategory, initialState)
  const [archiveState, archiveAction, archiving] = useActionState(archiveCategory, initialState)

  const archived = category.archivedAt !== null

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex items-center gap-3">
        {editing ? (
          <form action={renameAction} className="flex flex-1 items-center gap-2">
            <input type="hidden" name="id" value={category.id} />
            <Input
              name="name"
              defaultValue={category.name}
              required
              maxLength={40}
              aria-label={`Novo nome para ${category.name}`}
              className="min-h-11 flex-1 text-base"
            />
            <Button type="submit" size="sm" disabled={renaming} className="min-h-11">
              {renaming ? '…' : 'Salvar'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setEditing(false)}
              className="min-h-11"
            >
              Cancelar
            </Button>
          </form>
        ) : (
          <>
            <span
              aria-hidden
              className="size-3 shrink-0 rounded-full"
              style={{ backgroundColor: category.color }}
            />
            <span className="flex-1 truncate text-sm font-medium">{category.name}</span>
            <span className="text-muted-foreground bg-muted rounded-full px-2 py-0.5 text-xs">
              {category.kind === 'expense' ? 'saída' : 'entrada'}
            </span>

            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={`Renomear ${category.name}`}
              onClick={() => setEditing(true)}
              className="size-11"
            >
              <Pencil className="size-4" aria-hidden />
            </Button>

            <form action={archiveAction}>
              <input type="hidden" name="id" value={category.id} />
              <input type="hidden" name="archive" value={archived ? 'false' : 'true'} />
              <Button
                type="submit"
                size="icon"
                variant="ghost"
                disabled={archiving}
                aria-label={archived ? `Restaurar ${category.name}` : `Arquivar ${category.name}`}
                className="size-11"
              >
                {archived ? (
                  <ArchiveRestore className="size-4" aria-hidden />
                ) : (
                  <Archive className="size-4" aria-hidden />
                )}
              </Button>
            </form>
          </>
        )}
      </div>

      <FormMessage error={renameState.error ?? archiveState.error} />
    </li>
  )
}
