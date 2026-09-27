'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { Trash2 } from 'lucide-react'
import {
  createEntry,
  deleteEntry,
  updateEntry,
  type EntryActionState,
} from '@/lib/actions/entries'
import type { Category } from '@/lib/db/queries/categories'
import type { EntryWithCategory } from '@/lib/db/queries/entries'
import type { EntryKind } from '@/lib/db/types'
import { MoneyInput } from '@/components/finance/money-input'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FormMessage } from '@/components/auth/form-field'
import { cn } from '@/lib/utils'

const initialState: EntryActionState = {}

/**
 * Lançamento: criar e editar, o mesmo formulário.
 *
 * v1.1 — 2026-09-27: o [+] passou a usar `LaunchForm`, que cadastra também conta fixa, renda
 * fixa e parcelamento; este segue na edição (Histórico, Análise, "Ver lançamentos"). A nota de
 * lançamento gerado aponta renda fixa para `/rendas`.
 *
 * v1.0 — 2026-09-26: extraído de `app/(app)/novo/form.tsx`, que era o único formulário de
 * lançamento do app e só sabia criar — sem valores iniciais e com o destino da navegação
 * escrito dentro dele. `updateEntry` e `deleteEntry` existiam em `lib/actions/entries.ts` desde
 * a fase 3 **sem nenhuma tela que os chamasse**: corrigir um valor errado não era possível.
 *
 * A meta de `docs/DESIGN.md` para a criação continua valendo: salvar em dois toques, o valor já
 * com foco, descrição e categoria opcionais. Na edição o foco não é roubado — quem abriu para
 * mexer na data não quer o teclado numérico na frente.
 *
 * **Quem reaproveita este formulário para mais de um lançamento tem de passar
 * `key={entry.id}`.** Tipo, categoria e confirmação de exclusão são estado local, e sem a chave
 * eles sobreviveriam à troca de lançamento: abrir a linha do mercado depois da do salário
 * mostraria "Entrada" selecionado. Remontar pela chave é o idioma do React para isso — um
 * `useEffect` que redefine estado a cada troca renderiza duas vezes e ainda deixa a primeira
 * renderização com o valor errado.
 */
export function EntryForm({
  mode,
  entry,
  expenseCategories,
  incomeCategories,
  today,
  onDone,
}: {
  mode: 'create' | 'edit'
  /** Obrigatório em `edit`. */
  entry?: EntryWithCategory
  expenseCategories: Category[]
  incomeCategories: Category[]
  today: string
  /** Chamado depois de salvar ou excluir. */
  onDone?: (result: 'saved' | 'deleted') => void
}) {
  const [kind, setKind] = useState<EntryKind>(entry?.kind ?? 'expense')
  const [categoryId, setCategoryId] = useState<string>(entry?.category?.id ?? '')
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const [state, formAction, pending] = useActionState(
    async (previous: EntryActionState, formData: FormData) => {
      const result =
        mode === 'edit' ? await updateEntry(previous, formData) : await createEntry(previous, formData)
      if (result.success) onDone?.('saved')
      return result
    },
    initialState,
  )

  const [deleteState, deleteAction, deleting] = useActionState(
    async (previous: EntryActionState, formData: FormData) => {
      const result = await deleteEntry(previous, formData)
      if (result.success) onDone?.('deleted')
      return result
    },
    initialState,
  )

  const categories = kind === 'expense' ? expenseCategories : incomeCategories
  const generated = entry && entry.source !== 'manual' ? entry : null

  return (
    <div className="flex flex-col gap-6">
      {generated ? <GeneratedNote entry={generated} /> : null}

      <form action={formAction} className="flex flex-col gap-6">
        {mode === 'edit' && entry ? <input type="hidden" name="id" value={entry.id} /> : null}
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="categoryId" value={categoryId} />

        {/* Saída/entrada primeiro: define o significado de tudo abaixo. */}
        <div
          role="radiogroup"
          aria-label="Tipo"
          className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1"
        >
          {(['expense', 'income'] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={kind === option}
              onClick={() => {
                setKind(option)
                // A categoria escolhida pertence ao tipo anterior; limpar evita enviar uma
                // categoria de despesa num lançamento de receita.
                setCategoryId('')
              }}
              className={cn(
                'min-h-11 rounded-md text-sm font-semibold transition-colors',
                kind === option
                  ? option === 'expense'
                    ? 'bg-card text-[var(--expense)] shadow-sm'
                    : 'bg-card text-[var(--income)] shadow-sm'
                  : 'text-muted-foreground',
              )}
            >
              {option === 'expense' ? 'Saída' : 'Entrada'}
            </button>
          ))}
        </div>

        <MoneyInput
          label="Valor"
          initialCents={entry?.amountCents}
          autoFocus={mode === 'create'}
        />

        {categories.length > 0 ? (
          <div className="flex flex-col gap-2">
            <span className="text-muted-foreground text-sm font-medium">Categoria</span>
            {/* Chips em rolagem horizontal: em celular é mais rápido que um select. */}
            <div className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-1">
              {categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  aria-pressed={categoryId === category.id}
                  onClick={() => setCategoryId(categoryId === category.id ? '' : category.id)}
                  className={cn(
                    'min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors',
                    categoryId === category.id
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-input bg-card text-foreground',
                  )}
                >
                  {category.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="campo-descricao">Descrição</Label>
          <Input
            id="campo-descricao"
            name="description"
            required
            maxLength={120}
            defaultValue={entry?.description}
            placeholder={kind === 'expense' ? 'Mercado' : 'Salário'}
            className="min-h-11 text-base"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="campo-data">Data</Label>
          <Input
            id="campo-data"
            name="occurredOn"
            type="date"
            required
            defaultValue={entry?.occurredOn ?? today}
            className="min-h-11 text-base"
          />
        </div>

        <label className="flex min-h-11 items-center gap-3">
          <input
            type="checkbox"
            name="isSettled"
            defaultChecked={entry ? entry.isSettled : true}
            className="accent-primary size-5"
          />
          <span className="text-sm">{kind === 'expense' ? 'Já paguei' : 'Já recebi'}</span>
        </label>

        <FormMessage error={state.error} />

        <Button type="submit" disabled={pending} className="min-h-12 text-base">
          {pending ? 'Salvando…' : 'Salvar'}
        </Button>
      </form>

      {mode === 'edit' && entry ? (
        // Fora do formulário de cima: dois `<form>` aninhados não são HTML válido, e o botão
        // de excluir não deve arrastar os campos do outro consigo.
        <form action={deleteAction} className="flex flex-col gap-2 border-t pt-4">
          <input type="hidden" name="id" value={entry.id} />

          {confirmingDelete ? (
            <>
              <p className="text-muted-foreground text-sm">
                Excluir <span className="font-medium">{entry.description}</span>? Não dá para
                desfazer.
              </p>
              <div className="flex gap-2">
                <Button
                  type="submit"
                  disabled={deleting}
                  className="min-h-11 flex-1 bg-[var(--expense)] text-white hover:bg-[var(--expense)]/90"
                >
                  {deleting ? 'Excluindo…' : 'Excluir'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 flex-1"
                  onClick={() => setConfirmingDelete(false)}
                >
                  Manter
                </Button>
              </div>
            </>
          ) : (
            <Button
              type="button"
              variant="ghost"
              className="text-muted-foreground min-h-11 justify-start gap-2"
              onClick={() => setConfirmingDelete(true)}
            >
              <Trash2 className="size-4" aria-hidden />
              Excluir lançamento
            </Button>
          )}

          <FormMessage error={deleteState.error} />
        </form>
      ) : null}
    </div>
  )
}

/**
 * O aviso de que este lançamento tem um gerador atrás dele.
 *
 * Sem ele, excluir uma ocorrência de conta fixa parece resolver e não resolve: a regra segue
 * ativa e materializa a próxima. E mexer no valor de uma parcela isolada desfaz a soma exata
 * que `splitCents` garantiu na criação do plano — a pessoa precisa saber que o lugar de mudar
 * isso é o plano, não a linha.
 */
function GeneratedNote({ entry }: { entry: EntryWithCategory }) {
  const { label, href, explanation } =
    entry.source === 'installment'
      ? {
          label: 'parcelamento',
          href: '/parcelas' as const,
          explanation:
            entry.installmentNumber && entry.installmentTotal
              ? `É a parcela ${entry.installmentNumber} de ${entry.installmentTotal}. Mudar o valor aqui faz a soma das parcelas deixar de bater com o total da compra.`
              : 'Mudar o valor aqui faz a soma das parcelas deixar de bater com o total da compra.',
        }
      : entry.source === 'recurring'
        ? // v1.1 — 2026-09-27: renda fixa tem lista própria desde a fase 10.
          entry.kind === 'income'
          ? {
              label: 'renda fixa',
              href: '/rendas' as const,
              explanation:
                'Excluir só apaga esta ocorrência: a regra continua ativa e vai gerar a próxima. Para parar de vez, altere a renda fixa.',
            }
          : {
              label: 'conta fixa',
              href: '/compromissos' as const,
              explanation:
                'Excluir só apaga esta ocorrência: a regra continua ativa e vai gerar a próxima. Para parar de vez, altere a conta fixa.',
            }
        : {
            label: 'meta',
            href: '/metas' as const,
            explanation: 'O progresso da meta é a soma dos aportes, então mexer aqui muda o progresso.',
          }

  return (
    <p className="bg-muted text-muted-foreground rounded-xl p-4 text-sm">
      Este lançamento veio de {label === 'parcelamento' ? 'um' : 'uma'}{' '}
      <Link href={href} className="text-[var(--brand)] underline">
        {label}
      </Link>
      . {explanation}
    </p>
  )
}
