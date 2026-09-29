'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { MoneyInput } from '@/components/finance/money-input'
import { formatCents } from '@/lib/finance/money'
import type { SheetMonth } from '@/lib/finance/sheet'
import { cn } from '@/lib/utils'

/**
 * A grade da planilha — v1.0 — 28/09/2026 (Fase 14).
 *
 * Só desenha e captura o gesto; quem decide o que um duplo clique faz é a tela (`SheetView`,
 * `CardSheetView`), que conhece o que cada linha é. Assim a mesma grade serve à planilha
 * principal e à do cartão.
 *
 * Tabela HTML de verdade (`<table>`, `<th scope>`), e não uma grade de `div`s: é o que dá ao
 * leitor de tela a leitura "linha Aluguel, coluna out/26". A primeira coluna e o cabeçalho ficam
 * presos (`sticky`) e a rolagem lateral é só dentro do contêiner, nunca da página.
 *
 * Duplo clique é o gesto de planilha, mas não pode ser o único: Enter (ou F2) na célula ou no
 * nome faz o mesmo, e é por isso que cada um é um `<button>` alcançável pelo Tab.
 *
 * Cores: verde e vermelho só no que é dinheiro entrando e saindo (docs/DESIGN.md) — os valores
 * das seções. A marca do cenário é a cor da marca, e a previsão é itálico, que lê como "ainda
 * não aconteceu" sem gastar cor.
 */

export interface GridCell {
  cents: number
  /** O valor sem o cenário, quando há um — a célula marca a diferença. */
  realCents?: number
  hasPending?: boolean
  hasProjected?: boolean
}

export interface GridRow {
  key: string
  label: string
  /** Uma palavra ao lado do nome ("fatura", "3x"). */
  hint?: string
  cells: Readonly<Record<string, GridCell | undefined>>
  totalCents: number
}

export interface GridGroup {
  key: string
  title: string
  rows: GridRow[]
}

export interface GridSection {
  key: string
  title: string
  /** Colore os valores: entrada ou saída. `null` = neutro (planilha do cartão). */
  tone: 'income' | 'expense' | null
  groups: GridGroup[]
  totalLabel: string
  totals: Readonly<Record<string, { cents: number; realCents?: number } | undefined>>
  addLabel?: string
  onAdd?: () => void
}

export interface GridFooter {
  key: string
  label: string
  values: Readonly<Record<string, { cents: number; realCents?: number } | null | undefined>>
  /** `signed`: verde/vermelho pelo sinal (sobra, saldo). */
  tone: 'signed' | 'neutral'
  /** Texto no lugar do valor, por mês (ex.: situação da fatura). */
  texts?: Readonly<Record<string, string | undefined>>
}

/** O que a tela responde a um duplo clique numa célula. */
export type CellIntent = 'inline' | 'handled'

export interface CellTarget {
  row: GridRow
  sectionKey: string
  month: SheetMonth
}

export function SheetGrid({
  months,
  sections,
  footers,
  showReal = false,
  caption,
  onRowOpen,
  onCellOpen,
  onCellCommit,
}: {
  months: readonly SheetMonth[]
  sections: readonly GridSection[]
  footers: readonly GridFooter[]
  /** Com cenário: mostra o valor real quando a célula difere. */
  showReal?: boolean
  caption: string
  onRowOpen: (row: GridRow, sectionKey: string) => void
  /** Decide o gesto: editar ali mesmo (`inline`) ou a tela cuida (abriu uma janela). */
  onCellOpen: (target: CellTarget) => CellIntent
  /** O valor digitado na célula; devolve quando terminou de salvar. */
  onCellCommit: (target: CellTarget, cents: number) => Promise<void>
}) {
  const [editing, setEditing] = useState<{ rowKey: string; sectionKey: string; month: string } | null>(null)
  const [saving, setSaving] = useState<string | null>(null)

  function openCell(target: CellTarget) {
    if (saving) return
    if (onCellOpen(target) === 'inline') {
      setEditing({ rowKey: target.row.key, sectionKey: target.sectionKey, month: target.month.key })
    }
  }

  async function commit(target: CellTarget, cents: number) {
    const id = `${target.sectionKey}:${target.row.key}:${target.month.key}`
    setEditing(null)
    setSaving(id)
    try {
      await onCellCommit(target, cents)
    } finally {
      setSaving(null)
    }
  }

  const colCount = months.length + 2

  return (
    <div className="bg-card overflow-auto rounded-xl border" style={{ maxHeight: 'calc(100dvh - 15rem)' }}>
      <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th
              scope="col"
              className="bg-card sticky top-0 left-0 z-30 min-w-64 border-b px-3 py-2 text-left text-xs font-semibold"
            >
              Item
            </th>
            {months.map((month) => (
              <th
                key={month.key}
                scope="col"
                className={cn(
                  'bg-card sticky top-0 z-20 min-w-32 border-b px-3 py-2 text-right text-xs font-semibold capitalize',
                  month.isCurrent && 'text-[var(--brand)]',
                  month.isPast && 'text-muted-foreground',
                )}
              >
                {month.label}
                {month.isCurrent ? <span className="sr-only"> (mês atual)</span> : null}
              </th>
            ))}
            <th scope="col" className="bg-card sticky top-0 z-20 min-w-32 border-b px-3 py-2 text-right text-xs font-semibold">
              Total
            </th>
          </tr>
        </thead>

        {sections.map((section) => (
          <tbody key={section.key}>
            <tr>
              <th
                colSpan={colCount}
                scope="colgroup"
                className={cn(
                  'bg-muted sticky left-0 border-b px-3 py-2 text-left text-sm font-bold',
                  section.tone === 'income' && 'text-[var(--income)]',
                  section.tone === 'expense' && 'text-[var(--expense)]',
                )}
              >
                {section.title}
              </th>
            </tr>

            {section.groups.map((group) => (
              <GroupRows
                key={group.key}
                group={group}
                section={section}
                months={months}
                editing={editing}
                saving={saving}
                showReal={showReal}
                onRowOpen={onRowOpen}
                onCell={openCell}
                onCommit={commit}
                onCancel={() => setEditing(null)}
              />
            ))}

            {section.onAdd ? (
              <tr>
                <td className="bg-card sticky left-0 z-10 border-b px-2 py-1">
                  <button
                    type="button"
                    onClick={section.onAdd}
                    className="text-muted-foreground hover:text-foreground focus-visible:ring-ring flex min-h-9 items-center gap-1.5 rounded-md px-1 text-xs font-medium focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <Plus className="size-3.5" aria-hidden />
                    {section.addLabel ?? 'Novo'}
                  </button>
                </td>
                <td colSpan={colCount - 1} className="border-b" />
              </tr>
            ) : null}

            <tr>
              <th scope="row" className="bg-card sticky left-0 z-10 border-b px-3 py-2 text-left font-bold">
                {section.totalLabel}
              </th>
              {months.map((month) => {
                const total = section.totals[month.key]
                return (
                  <td key={month.key} className="border-b px-3 py-2 text-right font-bold">
                    <Value
                      cents={total?.cents ?? 0}
                      realCents={showReal ? total?.realCents : undefined}
                      tone={section.tone}
                    />
                  </td>
                )
              })}
              <td className="border-b px-3 py-2 text-right font-bold">
                <Value
                  cents={months.reduce((sum, m) => sum + (section.totals[m.key]?.cents ?? 0), 0)}
                  tone={section.tone}
                />
              </td>
            </tr>
          </tbody>
        ))}

        {footers.length > 0 ? (
          // "Quanto sobrou" e o saldo presos embaixo: são a resposta da planilha, e não podem
          // sumir quando a lista de despesas cresce.
          <tfoot className="sticky bottom-0 z-20">
            {footers.map((footer) => (
              <tr key={footer.key}>
                <th scope="row" className="bg-muted sticky left-0 z-10 border-t px-3 py-2 text-left font-bold">
                  {footer.label}
                </th>
                {months.map((month) => {
                  const text = footer.texts?.[month.key]
                  const value = footer.values[month.key]
                  return (
                    <td key={month.key} className="bg-muted border-b px-3 py-2 text-right font-semibold">
                      {text !== undefined ? (
                        <span className="text-muted-foreground text-xs font-medium">{text}</span>
                      ) : value === null || value === undefined ? (
                        <span className="text-muted-foreground" title="Antes do saldo informado em Ajustes">
                          —
                        </span>
                      ) : (
                        <SignedValue
                          cents={value.cents}
                          realCents={showReal ? value.realCents : undefined}
                          signed={footer.tone === 'signed'}
                        />
                      )}
                    </td>
                  )
                })}
                <td className="bg-muted border-b px-3 py-2" />
              </tr>
            ))}
          </tfoot>
        ) : null}
      </table>
    </div>
  )
}

function GroupRows({
  group,
  section,
  months,
  editing,
  saving,
  showReal,
  onRowOpen,
  onCell,
  onCommit,
  onCancel,
}: {
  group: GridGroup
  section: GridSection
  months: readonly SheetMonth[]
  editing: { rowKey: string; sectionKey: string; month: string } | null
  saving: string | null
  showReal: boolean
  onRowOpen: (row: GridRow, sectionKey: string) => void
  onCell: (target: CellTarget) => void
  onCommit: (target: CellTarget, cents: number) => void
  onCancel: () => void
}) {
  return (
    <>
      <tr>
        <th
          colSpan={months.length + 2}
          scope="colgroup"
          className="text-muted-foreground bg-card sticky left-0 border-b px-3 pt-3 pb-1 text-left text-[11px] font-semibold tracking-wide uppercase"
        >
          {group.title}
        </th>
      </tr>
      {group.rows.map((row) => (
        <tr key={row.key} className="group/row hover:bg-[var(--surface)]">
          <th scope="row" className="bg-card group-hover/row:bg-[var(--surface)] sticky left-0 z-10 border-b p-0 text-left font-normal">
            <button
              type="button"
              title="Dois cliques para editar"
              onDoubleClick={() => onRowOpen(row, section.key)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === 'F2') {
                  event.preventDefault()
                  onRowOpen(row, section.key)
                }
              }}
              className="focus-visible:ring-ring flex min-h-9 w-full max-w-72 items-center gap-2 px-3 text-left focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
            >
              <span className="truncate">{row.label}</span>
              {row.hint ? <span className="text-muted-foreground shrink-0 text-[11px]">{row.hint}</span> : null}
            </button>
          </th>
          {months.map((month) => {
            const cell = row.cells[month.key]
            const target: CellTarget = { row, sectionKey: section.key, month }
            const isEditing =
              editing?.rowKey === row.key && editing.sectionKey === section.key && editing.month === month.key
            const isSaving = saving === `${section.key}:${row.key}:${month.key}`
            return (
              <td key={month.key} className="border-b p-0 text-right">
                {isEditing ? (
                  // Sair da célula sem Enter desiste, como numa planilha com Esc.
                  <div className="px-1 py-0.5" onBlur={onCancel}>
                    <MoneyInput
                      cell
                      name={null}
                      label={`${row.label}, ${month.label}`}
                      initialCents={cell?.cents ?? 0}
                      autoFocus
                      onEnter={(cents) => onCommit(target, cents)}
                      onEscape={onCancel}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    aria-label={`${row.label}, ${month.label}: ${cell ? formatCents(cell.cents) : 'vazio'}`}
                    onDoubleClick={() => onCell(target)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === 'F2') {
                        event.preventDefault()
                        onCell(target)
                      }
                    }}
                    className={cn(
                      'focus-visible:ring-ring flex min-h-9 w-full items-center justify-end gap-1 px-3 tabular focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset',
                      cell?.hasProjected && 'italic',
                      isSaving && 'opacity-50',
                    )}
                  >
                    {cell?.hasPending ? (
                      <span
                        className="size-1.5 shrink-0 rounded-full border border-current"
                        title="Pendente"
                        aria-hidden
                      />
                    ) : null}
                    {cell && (cell.cents !== 0 || (showReal && cell.realCents !== undefined && cell.realCents !== 0)) ? (
                      <Value cents={cell.cents} realCents={showReal ? cell.realCents : undefined} tone={null} />
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </button>
                )}
              </td>
            )
          })}
          <td className="text-muted-foreground border-b px-3 py-2 text-right tabular">
            {row.totalCents !== 0 ? formatCents(row.totalCents) : ''}
          </td>
        </tr>
      ))}
    </>
  )
}

/** O valor, com o real riscado embaixo quando o cenário mudou a célula. */
function Value({
  cents,
  realCents,
  tone,
}: {
  cents: number
  realCents?: number
  tone: 'income' | 'expense' | null
}) {
  const differs = realCents !== undefined && realCents !== cents
  return (
    <span className="flex flex-col items-end leading-tight">
      <span
        className={cn(
          'tabular',
          tone === 'income' && 'text-[var(--income)]',
          tone === 'expense' && 'text-[var(--expense)]',
          differs && 'font-semibold text-[var(--brand)]',
        )}
      >
        {formatCents(cents)}
        {differs ? <span className="sr-only"> no cenário</span> : null}
      </span>
      {differs ? (
        <span className="text-muted-foreground text-[11px] font-normal not-italic line-through">
          <span className="sr-only">sem o cenário: </span>
          {formatCents(realCents)}
        </span>
      ) : null}
    </span>
  )
}

function SignedValue({ cents, realCents, signed }: { cents: number; realCents?: number; signed: boolean }) {
  const differs = realCents !== undefined && realCents !== cents
  return (
    <span className="flex flex-col items-end leading-tight">
      <span
        className={cn(
          'tabular',
          signed && (cents < 0 ? 'text-[var(--expense)]' : 'text-[var(--income)]'),
          differs && 'underline decoration-[var(--brand)] decoration-2 underline-offset-2',
        )}
      >
        {formatCents(cents)}
      </span>
      {differs ? (
        <span className="text-muted-foreground text-[11px] font-normal line-through">
          <span className="sr-only">sem o cenário: </span>
          {formatCents(realCents)}
        </span>
      ) : null}
    </span>
  )
}
