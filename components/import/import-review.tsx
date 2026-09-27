'use client'

import { memo, useCallback, useMemo, useState } from 'react'
import type { ReconcileLink } from '@/lib/finance/reconcile'
import type { CategoryOption } from '@/lib/import/suggest'
import type { KeyedRow } from '@/lib/import/types'
import { formatCents } from '@/lib/finance/money'
import { MoneyInput } from '@/components/finance/money-input'
import { cn } from '@/lib/utils'

/**
 * A conferência do extrato. v1.3 — 2026-09-27.
 *
 * v1.3 (Fase 13): a linha também pode pagar a fatura de um cartão ou empréstimo ("pagamento
 * da fatura"). As compras no cartão nunca são conectadas: quem as conclui é a fatura.
 *
 * v1.2: a linha conectada a um item cadastrado diz o que vai marcar como pago ("Salário ·
 * renda fixa · vence 05/10"), pela palavra-chave de quem, e com que diferença de valor. Um
 * toque solta a conexão, outro a devolve; e há um filtro só para elas.
 *
 * Mesmo espírito do "Entendi assim" do assistente: nada é gravado antes de a pessoa ver, e
 * tudo que dá para errar dá para ajustar aqui — incluir ou não, descrição, tipo, valor, data
 * e categoria. Com até 1000 linhas, a lista precisa ser leve: cada linha é memorizada e o
 * formulário de ajuste só existe na linha aberta.
 */

// v1.1 — 2026-09-27: 'keyword', a categoria que veio da palavra-chave da própria pessoa.
export type CategorySource = 'keyword' | 'history' | 'ai' | 'user' | null

export interface ReviewRow extends KeyedRow {
  include: boolean
  categoryId: string | null
  categorySource: CategorySource
  /** Já importada antes: aparece, mas não pode ser marcada. */
  imported: boolean
  /** Bate com lançamento feito à mão (mesmo dia, tipo e valor): vem desmarcada. */
  duplicate: boolean
  /** v1.2 — 2026-09-27: o item cadastrado que esta linha liquida. `null` = lançamento novo. */
  link: ReconcileLink | null
  /** A conexão que o casamento achou, para "Conectar" devolver depois de "Não é este". */
  linkSuggestion: ReconcileLink | null
}

export interface RowPatch {
  include?: boolean
  description?: string
  kind?: 'income' | 'expense'
  amountCents?: number
  occurredOn?: string
  categoryId?: string | null
  categorySource?: CategorySource
  link?: ReconcileLink | null
  linkSuggestion?: ReconcileLink | null
}

type Filter = 'all' | 'check' | 'uncategorized' | 'linked'

/** `2026-09-26` → `26/09`. Fatiamento de string, nunca `Date` (invariante 2). */
export function diaEMes(iso: string): string {
  const [, mes, dia] = iso.split('-')
  return mes && dia ? `${dia}/${mes}` : iso
}

export function ImportReview({
  rows,
  categories,
  onPatch,
  onPatchCategoryGroup,
}: {
  rows: readonly ReviewRow[]
  categories: readonly CategoryOption[]
  onPatch: (index: number, patch: RowPatch) => void
  /** Categoria para todas as linhas da mesma contraparte e tipo. */
  onPatchCategoryGroup: (counterpartyKey: string, kind: 'income' | 'expense', categoryId: string | null) => void
}) {
  const [filter, setFilter] = useState<Filter>('all')
  const [open, setOpen] = useState<number | null>(null)
  // Estável, para o `memo` das linhas valer: abrir uma linha não redesenha as outras 999.
  const toggle = useCallback((index: number) => setOpen((atual) => (atual === index ? null : index)), [])

  const categoryName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories])
  const groupSize = useMemo(() => {
    const sizes = new Map<string, number>()
    for (const row of rows) {
      const k = `${row.kind}:${row.counterpartyKey}`
      sizes.set(k, (sizes.get(k) ?? 0) + 1)
    }
    return sizes
  }, [rows])

  const visible = rows.filter((row) => {
    if (filter === 'check') return row.kindInferred || row.duplicate
    if (filter === 'uncategorized') return !row.imported && !row.link && row.categoryId === null
    if (filter === 'linked') return row.linkSuggestion !== null
    return true
  })

  const byDay = new Map<string, ReviewRow[]>()
  for (const row of visible) {
    const list = byDay.get(row.occurredOn) ?? []
    list.push(row)
    byDay.set(row.occurredOn, list)
  }

  const toCheck = rows.filter((r) => r.kindInferred || r.duplicate).length
  const uncategorized = rows.filter((r) => !r.imported && !r.link && r.categoryId === null).length
  const linked = rows.filter((r) => r.linkSuggestion !== null).length

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Filtrar" className="flex flex-wrap gap-2 text-xs">
        <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
          Todos ({rows.length})
        </Chip>
        {linked > 0 && (
          <Chip active={filter === 'linked'} onClick={() => setFilter('linked')}>
            Conectados ({linked})
          </Chip>
        )}
        {toCheck > 0 && (
          <Chip active={filter === 'check'} onClick={() => setFilter('check')}>
            Conferir ({toCheck})
          </Chip>
        )}
        {uncategorized > 0 && (
          <Chip active={filter === 'uncategorized'} onClick={() => setFilter('uncategorized')}>
            Sem categoria ({uncategorized})
          </Chip>
        )}
      </div>

      {visible.length === 0 && <p className="text-muted-foreground text-sm">Nada neste filtro.</p>}

      {[...byDay].map(([day, list]) => (
        <section key={day} className="flex flex-col gap-1.5">
          <h3 className="text-muted-foreground text-xs font-semibold">{diaEMes(day)}</h3>
          <ul className="flex flex-col gap-1.5">
            {list.map((row) => (
              <Row
                key={row.index}
                row={row}
                categoryLabel={row.categoryId ? (categoryName.get(row.categoryId) ?? null) : null}
                isOpen={open === row.index}
                onToggle={toggle}
                onPatch={onPatch}
                categories={categories}
                sameCount={groupSize.get(`${row.kind}:${row.counterpartyKey}`) ?? 1}
                onPatchCategoryGroup={onPatchCategoryGroup}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'min-h-8 rounded-full border px-3',
        active ? 'bg-primary text-primary-foreground border-transparent' : 'bg-card',
      )}
    >
      {children}
    </button>
  )
}

const Row = memo(function Row({
  row,
  categoryLabel,
  isOpen,
  onToggle,
  onPatch,
  categories,
  sameCount,
  onPatchCategoryGroup,
}: {
  row: ReviewRow
  categoryLabel: string | null
  isOpen: boolean
  onToggle: (index: number) => void
  onPatch: (index: number, patch: RowPatch) => void
  categories: readonly CategoryOption[]
  sameCount: number
  onPatchCategoryGroup: (counterpartyKey: string, kind: 'income' | 'expense', categoryId: string | null) => void
}) {
  const income = row.kind === 'income'
  const onToggleOpen = () => onToggle(row.index)

  return (
    <li
      className={cn(
        'rounded-lg border bg-[var(--surface)] text-sm',
        (!row.include || row.imported) && 'opacity-60',
      )}
    >
      <div className="flex items-start gap-3 p-3">
        <input
          type="checkbox"
          aria-label={`Incluir ${row.description}`}
          checked={row.include && !row.imported}
          disabled={row.imported}
          onChange={(event) => onPatch(row.index, { include: event.target.checked })}
          className="mt-0.5 size-5 shrink-0 accent-[var(--brand)]"
        />
        <button type="button" onClick={onToggleOpen} className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
          <span className="truncate">{row.description}</span>
          <span className="text-muted-foreground flex flex-wrap gap-x-2 text-xs">
            {/* v1.2 — 2026-09-27: conectada, a categoria é a do item que ela liquida. */}
            {row.link ? null : (
              <span>
                {categoryLabel ?? 'Sem categoria'}
                {row.categorySource === 'keyword' && ' · pela palavra-chave'}
                {row.categorySource === 'ai' && ' · sugerida pela IA'}
                {row.categorySource === 'history' && ' · do histórico'}
              </span>
            )}
            {row.imported && <span className="font-medium">já importado</span>}
            {row.duplicate && !row.imported && <span className="font-medium">parece já lançado</span>}
            {row.kindInferred && <span className="font-medium">conferir entrada/saída</span>}
          </span>
        </button>
        <span
          className={cn(
            'tabular shrink-0 text-sm font-semibold',
            income ? 'text-[var(--color-income)]' : 'text-[var(--color-expense)]',
          )}
        >
          {income ? '+' : '−'}
          {formatCents(row.amountCents)}
        </span>
      </div>

      {row.linkSuggestion && !row.imported && (
        <LinkNote row={row} link={row.linkSuggestion} onPatch={onPatch} />
      )}

      {isOpen && !row.imported && (
        <RowEditor
          row={row}
          categories={categories}
          sameCount={sameCount}
          onSave={(patch, applyToGroup) => {
            onPatch(row.index, patch)
            if (applyToGroup && patch.kind !== undefined) {
              onPatchCategoryGroup(row.counterpartyKey, patch.kind, patch.categoryId ?? null)
            }
            onToggleOpen()
          }}
          onCancel={onToggleOpen}
        />
      )}
    </li>
  )
})

const ORIGIN_LABEL: Record<ReconcileLink['origin'], string> = {
  avulso: 'lançamento pendente',
  parcela: 'parcela',
  'conta fixa': 'conta fixa',
  'renda fixa': 'renda fixa',
  meta: 'aporte na meta',
  // v1.3 — 2026-09-27 (Fase 13): a linha paga a fatura; as compras dela não são tocadas.
  fatura: 'pagamento da fatura',
}

/**
 * A conexão de uma linha com o item cadastrado. v1.0 — 2026-09-27.
 *
 * Conectada: "Marca como paga: Salário · renda fixa · vence 05/10", a palavra que decidiu e a
 * diferença de valor — que na parcela é só aviso, porque ela mantém o próprio valor. Solta:
 * a mesma linha, apagada, com "Conectar" para voltar atrás.
 */
function LinkNote({
  row,
  link,
  onPatch,
}: {
  row: ReviewRow
  link: ReconcileLink
  onPatch: (index: number, patch: RowPatch) => void
}) {
  const active = row.link !== null
  const diff = link.amountDiffCents
  const verb =
    link.origin === 'meta' || link.origin === 'fatura'
      ? 'Registra'
      : row.kind === 'income'
        ? 'Marca como recebida'
        : 'Marca como paga'

  return (
    <div
      className={cn(
        'mx-3 mb-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs',
        active ? 'border-[var(--color-income)]/40 bg-card' : 'bg-transparent opacity-70',
      )}
    >
      <p className="min-w-0 flex-1">
        <span className="font-medium">{active ? verb : 'Não conectado'}:</span> {link.label} ·{' '}
        {ORIGIN_LABEL[link.origin]}
        {link.dueOn ? ` · vence ${diaEMes(link.dueOn)}` : ''}
        {link.keyword ? (
          <span className="text-muted-foreground"> · pela palavra-chave &ldquo;{link.keyword}&rdquo;</span>
        ) : (
          <span className="text-muted-foreground"> · mesmo dia e valor</span>
        )}
        {active && diff !== 0 ? (
          <span className="text-muted-foreground block">
            {link.keepsAmount
              ? `A parcela continua ${formatCents(link.expectedCents)}; o extrato diz ${formatCents(row.amountCents)}.`
              : `Previsto ${formatCents(link.expectedCents)}; fica o valor do extrato.`}
          </span>
        ) : null}
      </p>
      <button
        type="button"
        onClick={() => onPatch(row.index, { link: active ? null : link, include: true })}
        className="min-h-8 shrink-0 rounded-full border px-3 font-medium"
      >
        {active ? 'Não é este' : 'Conectar'}
      </button>
    </div>
  )
}

/**
 * O ajuste de uma linha.
 *
 * Formulário não controlado lido no "Salvar", como o `CamposDeAjuste` do assistente: o valor
 * sai do `MoneyInput` já em centavos inteiros e a data do `<input type="date">` já em
 * `YYYY-MM-DD` — nenhum `parseFloat` nem `new Date` no caminho (invariantes 1 e 2).
 */
function RowEditor({
  row,
  categories,
  sameCount,
  onSave,
  onCancel,
}: {
  row: ReviewRow
  categories: readonly CategoryOption[]
  sameCount: number
  onSave: (patch: RowPatch, applyToGroup: boolean) => void
  onCancel: () => void
}) {
  const [kind, setKind] = useState(row.kind)
  const options = categories.filter((c) => c.kind === kind)

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        const cents = Number(data.get('amountCents'))
        const description = String(data.get('description') ?? '').trim()
        const occurredOn = String(data.get('occurredOn') ?? '')
        const categoryId = String(data.get('categoryId') ?? '') || null
        onSave(
          {
            kind,
            description: description || row.description,
            amountCents: Number.isInteger(cents) && cents > 0 ? cents : row.amountCents,
            occurredOn: /^\d{4}-\d{2}-\d{2}$/.test(occurredOn) ? occurredOn : row.occurredOn,
            categoryId,
            categorySource: categoryId === row.categoryId ? row.categorySource : 'user',
            include: true,
          },
          data.get('applyToGroup') === 'on',
        )
      }}
      className="flex flex-col gap-3 border-t p-3"
    >
      <Field label="Descrição">
        <input
          name="description"
          defaultValue={row.description}
          maxLength={120}
          className="border-input bg-card min-h-11 rounded-xl border px-3 text-base"
        />
      </Field>

      <Field label="Tipo">
        <select
          value={kind}
          onChange={(event) => setKind(event.target.value === 'income' ? 'income' : 'expense')}
          className="border-input bg-card min-h-11 rounded-xl border px-3 text-base"
        >
          <option value="expense">Saída</option>
          <option value="income">Entrada</option>
        </select>
      </Field>

      <MoneyInput name="amountCents" label="Valor" initialCents={row.amountCents} compact />

      <Field label="Data">
        <input
          name="occurredOn"
          type="date"
          defaultValue={row.occurredOn}
          className="border-input bg-card min-h-11 rounded-xl border px-3 text-base"
        />
      </Field>

      <Field label="Categoria">
        <select
          name="categoryId"
          // Trocar o tipo troca a lista; a categoria antiga só continua se for do novo tipo.
          key={kind}
          defaultValue={options.some((c) => c.id === row.categoryId) ? (row.categoryId ?? '') : ''}
          className="border-input bg-card min-h-11 rounded-xl border px-3 text-base"
        >
          <option value="">Sem categoria</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>

      {sameCount > 1 && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="applyToGroup" defaultChecked className="size-4 accent-[var(--brand)]" />
          Usar esta categoria nos {sameCount} lançamentos iguais
        </label>
      )}

      <div className="flex gap-2">
        <button type="submit" className="bg-primary text-primary-foreground min-h-11 flex-1 rounded-xl text-sm font-semibold">
          Salvar ajuste
        </button>
        <button type="button" onClick={onCancel} className="min-h-11 rounded-xl border px-4 text-sm">
          Fechar
        </button>
      </div>
    </form>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-muted-foreground text-sm font-medium">{label}</span>
      {children}
    </label>
  )
}
