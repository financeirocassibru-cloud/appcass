'use client'

import { useActionState, useState, type KeyboardEvent } from 'react'
import { Archive, ArchiveRestore, Pencil, Tags, X } from 'lucide-react'
import {
  archiveCategory,
  createCategory,
  renameCategory,
  updateCategoryKeywords,
  type CategoryActionState,
} from '@/lib/actions/categories'
import { MAX_KEYWORDS, parseKeywords } from '@/lib/finance/keywords'
import type { Category } from '@/lib/db/queries/categories'
import { FormMessage } from '@/components/auth/form-field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const initialState: CategoryActionState = {}

/*
 * Tela de categorias. v1.1 — 2026-09-27.
 *
 * v1.1: cada categoria ganhou "Palavras-chave" (ícone de etiqueta). Um lançamento cujo nome
 * contém uma delas entra na categoria sozinho, na importação de extrato e no [+].
 */

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
  const [editingKeywords, setEditingKeywords] = useState(false)
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
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium">{category.name}</span>
              {category.keywords.length > 0 ? (
                <span className="text-muted-foreground truncate text-xs">
                  {category.keywords.join(', ')}
                </span>
              ) : null}
            </span>
            <span className="text-muted-foreground bg-muted rounded-full px-2 py-0.5 text-xs">
              {category.kind === 'expense' ? 'saída' : 'entrada'}
            </span>

            {archived ? null : (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={`Palavras-chave de ${category.name}`}
                aria-expanded={editingKeywords}
                onClick={() => setEditingKeywords((v) => !v)}
                className="size-11"
              >
                <Tags className="size-4" aria-hidden />
              </Button>
            )}

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

      {editingKeywords && !archived ? (
        <KeywordsEditor category={category} onDone={() => setEditingKeywords(false)} />
      ) : null}

      <FormMessage error={renameState.error ?? archiveState.error} />
    </li>
  )
}

/**
 * As palavras-chave de uma categoria, em chips. v1.0 — 2026-09-27.
 *
 * Enter ou vírgula transforma o que foi digitado em chip; o X remove. O que vai para a
 * Server Action é a lista inteira, e a limpeza (repetidas, vazias, teto) é a mesma
 * `parseKeywords` dos dois lados.
 */
function KeywordsEditor({ category, onDone }: { category: Category; onDone: () => void }) {
  const [keywords, setKeywords] = useState<string[]>(category.keywords)
  const [draft, setDraft] = useState('')
  const [state, action, pending] = useActionState(
    async (prev: CategoryActionState, formData: FormData) => {
      const result = await updateCategoryKeywords(prev, formData)
      if (result.success) onDone()
      return result
    },
    initialState,
  )

  function add(text: string) {
    const next = parseKeywords([...keywords, ...parseKeywords(text)])
    setKeywords(next)
    setDraft('')
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      if (draft.trim()) add(draft)
    } else if (event.key === 'Backspace' && draft === '' && keywords.length > 0) {
      setKeywords(keywords.slice(0, -1))
    }
  }

  // O rascunho que ficou no campo também conta: quem digita "ifood" e toca em Salvar
  // espera que ele entre.
  const final = parseKeywords([...keywords, ...parseKeywords(draft)])
  const inputId = `palavras-${category.id}`

  return (
    <form action={action} className="bg-muted/40 flex flex-col gap-2 rounded-xl p-3">
      <input type="hidden" name="id" value={category.id} />
      <input type="hidden" name="keywords" value={final.join(', ')} />

      <Label htmlFor={inputId}>Palavras-chave</Label>
      <p className="text-muted-foreground text-xs">
        Lançamentos cujo nome contém uma dessas palavras entram em {category.name} sozinhos.
        Sem acento e sem diferença entre maiúsculas.
      </p>

      {keywords.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Palavras-chave adicionadas">
          {keywords.map((keyword) => (
            <li
              key={keyword}
              className="bg-card flex items-center gap-1 rounded-full border py-0.5 pr-1 pl-3 text-sm"
            >
              {keyword}
              <button
                type="button"
                onClick={() => setKeywords(keywords.filter((k) => k !== keyword))}
                aria-label={`Remover ${keyword}`}
                className="hover:bg-muted flex size-7 items-center justify-center rounded-full"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <Input
        id={inputId}
        value={draft}
        onChange={(event) => {
          const value = event.target.value
          // Colar "ifood, rappi" vira dois chips de uma vez.
          if (/[,;\n]/.test(value)) add(value)
          else setDraft(value)
        }}
        onKeyDown={onKeyDown}
        disabled={keywords.length >= MAX_KEYWORDS}
        placeholder={keywords.length === 0 ? 'ifood, rappi, padaria' : 'Outra palavra'}
        enterKeyHint="done"
        className="min-h-11 text-base"
      />

      <FormMessage error={state.error} />

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending} className="min-h-11 flex-1">
          {pending ? 'Salvando…' : 'Salvar'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone} className="min-h-11">
          Cancelar
        </Button>
      </div>
    </form>
  )
}
