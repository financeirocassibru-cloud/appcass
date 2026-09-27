'use client'

import { useId, useState, type KeyboardEvent } from 'react'
import { Plus, X } from 'lucide-react'
import { MAX_KEYWORDS, parseKeywords, suggestKeywords } from '@/lib/finance/keywords'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/**
 * Palavras-chave em chips, com sugestão do que já veio no extrato. v1.0 — 2026-09-27.
 *
 * Nasceu do editor de Categorias (fase 11) e passou a servir lançamento, conta/renda fixa,
 * parcelamento e meta (migration 0019). Enter ou vírgula transforma o que foi digitado em
 * chip; colar "ifood, rappi" vira dois; Backspace no campo vazio tira o último; o X remove.
 *
 * O diferencial é a lista embaixo do campo: as descrições únicas dos lançamentos já
 * importados (`listImportedDescriptions`), filtradas pelo que se digita. Quem cadastra o
 * salário não precisa adivinhar como o banco escreve o nome da empresa — escolhe o que o
 * extrato do mês passado trouxe.
 *
 * O que vai para a Server Action é um `<input type="hidden" name={name}>` com a lista inteira
 * separada por vírgula, rascunho incluído (quem digita "ifood" e salva espera que ele entre).
 * A limpeza é a mesma `parseKeywords` dos dois lados.
 */
export function KeywordField({
  name = 'keywords',
  label = 'Palavras-chave',
  hint,
  initial = [],
  suggestions = [],
  placeholder = 'Nome como aparece no extrato',
  onChange,
}: {
  name?: string
  label?: string
  hint?: string
  initial?: readonly string[]
  /** Descrições já importadas, mais frequentes primeiro. */
  suggestions?: readonly string[]
  placeholder?: string
  /** A lista final a cada mudança, rascunho incluído. */
  onChange?: (keywords: string[]) => void
}) {
  const baseId = useId()
  const inputId = `${baseId}-campo`
  const listId = `${baseId}-sugestoes`

  const [keywords, setKeywords] = useState<string[]>(() => parseKeywords(initial))
  const [draft, setDraft] = useState('')
  const [focused, setFocused] = useState(false)
  const [active, setActive] = useState(-1)

  const full = keywords.length >= MAX_KEYWORDS
  const options = full ? [] : suggestKeywords(draft, suggestions, keywords, 6)
  const open = focused && options.length > 0

  function commit(next: string[], nextDraft: string) {
    setKeywords(next)
    setDraft(nextDraft)
    setActive(-1)
    onChange?.(parseKeywords([...next, ...parseKeywords(nextDraft)]))
  }

  function add(text: string) {
    commit(parseKeywords([...keywords, ...parseKeywords(text)]), '')
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' && open) {
      event.preventDefault()
      setActive((i) => (i + 1) % options.length)
    } else if (event.key === 'ArrowUp' && open) {
      event.preventDefault()
      setActive((i) => (i <= 0 ? options.length - 1 : i - 1))
    } else if (event.key === 'Enter' || event.key === ',') {
      const chosen = open && active >= 0 ? options[active] : undefined
      if (chosen) {
        event.preventDefault()
        add(chosen)
      } else if (draft.trim()) {
        event.preventDefault()
        add(draft)
      }
    } else if (event.key === 'Escape') {
      setActive(-1)
      setFocused(false)
    } else if (event.key === 'Backspace' && draft === '' && keywords.length > 0) {
      commit(keywords.slice(0, -1), '')
    }
  }

  const final = parseKeywords([...keywords, ...parseKeywords(draft)])

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name={name} value={final.join(', ')} />

      <Label htmlFor={inputId}>{label}</Label>
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}

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
                onClick={() => commit(keywords.filter((k) => k !== keyword), draft)}
                aria-label={`Remover ${keyword}`}
                className="hover:bg-muted flex size-7 items-center justify-center rounded-full"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="relative">
        <Input
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
          value={draft}
          onChange={(event) => {
            const value = event.target.value
            // Colar "ifood, rappi" vira dois chips de uma vez.
            if (/[,;\n]/.test(value)) add(value)
            else commit(keywords, value)
          }}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          disabled={full}
          placeholder={full ? `No máximo ${MAX_KEYWORDS}` : placeholder}
          enterKeyHint="done"
          autoComplete="off"
          className="min-h-11 text-base"
        />

        {open ? (
          <ul
            id={listId}
            role="listbox"
            aria-label="Do que já veio no extrato"
            className="bg-card absolute inset-x-0 top-full z-20 mt-1 flex max-h-64 flex-col overflow-y-auto rounded-xl border p-1 shadow-md"
          >
            {options.map((option, index) => (
              <li
                key={option}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                // `mousedown` e não `click`: o `blur` do campo viria antes e fecharia a lista.
                onMouseDown={(event) => {
                  event.preventDefault()
                  add(option)
                }}
                className={cn(
                  'flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm',
                  index === active ? 'bg-muted' : 'hover:bg-muted',
                )}
              >
                <Plus className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{option}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}
