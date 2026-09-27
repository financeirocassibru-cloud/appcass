'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import type { BucketPoint } from '@/lib/finance/buckets'
import { formatDayLabel } from '@/lib/finance/grouping'
import { formatCents } from '@/lib/finance/money'
import type { Category } from '@/lib/db/queries/categories'
import type { EntryWithCategory } from '@/lib/db/queries/entries'
import type { Occurrence } from '@/lib/finance/types'
import { EntryForm } from '@/components/finance/entry-form'
import { Money } from '@/components/finance/money'
import { Balance } from '@/components/finance/money'
import { Button } from '@/components/ui/button'

/**
 * O que aconteceu — ou vai acontecer — no **período** tocado no gráfico, e as ações sobre ele.
 *
 * v1.0 — 2026-09-27.
 *
 * Período, e não dia: o painel recebe um `BucketPoint`, então na escala semanal ele lista os
 * lançamentos da semana inteira — com a data em cada linha, que numa lista de um dia só seria
 * repetição — e na mensal os do mês. Lançar, alterar e excluir valem para qualquer um deles.
 *
 * **Não é modal, de propósito.** Um `Dialog` ou `Sheet` do Radix renderiza num portal em
 * `document.body`, e dentro de um elemento em fullscreen nativo isso é fora da subárvore
 * exibida: na tela cheia do gráfico a pessoa tocaria em "editar" e nada apareceria. Este painel
 * é `<aside>` no lugar, então funciona igual dentro e fora da tela cheia. (Os portais também
 * passaram a aceitar um container declarado, em `components/ui/portal-container.tsx`, para a
 * próxima tela cheia não bater na mesma parede.)
 *
 * Só lançamento **real** é editável. Ocorrência prevista de conta fixa ainda não materializada,
 * aporte de meta e item hipotético de cenário não são linhas de `entries` — não há o que
 * atualizar, e oferecer o botão prometeria algo que a action recusaria.
 */
export function PeriodPanel({
  point,
  today,
  entriesById,
  expenseCategories,
  incomeCategories,
  onClose,
  onFormOpenChange,
  renderActions,
}: {
  point: BucketPoint
  today: string
  /** Os lançamentos reais da janela, para o formulário abrir já preenchido. */
  entriesById: Record<string, EntryWithCategory>
  expenseCategories: Category[]
  incomeCategories: Category[]
  onClose?: () => void
  /** Avisa quem está por fora que um formulário abriu — a tela cheia usa isso para desligar a
   *  rotação por CSS enquanto a pessoa digita. */
  onFormOpenChange?: (open: boolean) => void
  /**
   * Ações extras por ocorrência — hoje, os ajustes de cenário.
   *
   * Render prop, e não um `scenario` aqui dentro, porque `OccurrenceActions` mora na rota
   * `/analise`: um componente de `components/` importando de `app/` inverteria a direção da
   * dependência.
   */
  renderActions?: (occurrence: Occurrence) => React.ReactNode
}) {
  const router = useRouter()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const editing = editingId ? entriesById[editingId] : undefined

  function openEdit(id: string | null) {
    setEditingId(id)
    onFormOpenChange?.(id !== null)
  }

  function openCreate(open: boolean) {
    setCreating(open)
    onFormOpenChange?.(open)
  }

  function done(message: string) {
    toast.success(message)
    setEditingId(null)
    setCreating(false)
    onFormOpenChange?.(false)
    // `revalidatePath` na action atualiza o cache do servidor; o `refresh` é o que faz esta
    // árvore — já montada, e possivelmente em tela cheia — buscar a versão nova sem fechar.
    router.refresh()
  }

  if (editing) {
    return (
      <PanelShell title="Editar lançamento" onBack={() => openEdit(null)} onClose={onClose}>
        <EntryForm
          key={editing.id}
          mode="edit"
          entry={editing}
          expenseCategories={expenseCategories}
          incomeCategories={incomeCategories}
          today={today}
          onDone={(result) =>
            done(result === 'deleted' ? 'Lançamento excluído.' : 'Lançamento atualizado.')
          }
        />
      </PanelShell>
    )
  }

  if (creating) {
    return (
      <PanelShell title="Novo lançamento" onBack={() => openCreate(false)} onClose={onClose}>
        <EntryForm
          mode="create"
          expenseCategories={expenseCategories}
          incomeCategories={incomeCategories}
          // A data já vem do período tocado, e o toque já disse qual é — digitar de novo seria
          // repetição. Num período de vários dias o palpite é **hoje**, quando hoje cai dentro
          // dele; o primeiro dia só quando não cai, porque aí não há dia "corrente" ali.
          today={defaultDateFor(point, today)}
          onDone={() => done('Lançamento salvo.')}
        />
      </PanelShell>
    )
  }

  return (
    <PanelShell
      title={point.dayCount === 1 ? formatDayLabel(point.from, today) : point.label}
      onClose={onClose}
    >
      <dl className="grid grid-cols-3 gap-2">
        <Figure label="Entrou">
          <Money cents={point.inflowCents} kind="income" withSign={false} className="text-sm" />
        </Figure>
        <Figure label="Saiu">
          <Money cents={point.outflowCents} kind="expense" withSign={false} className="text-sm" />
        </Figure>
        <Figure label={point.dayCount === 1 ? 'Saldo' : 'Saldo no fim'}>
          <Balance cents={point.closingBalanceCents} className="text-sm" />
        </Figure>
      </dl>

      {point.minBalanceCents !== point.closingBalanceCents ? (
        <p className="text-xs text-[var(--chart-expense)]">
          Menor saldo do período:{' '}
          <span className="tabular font-semibold">{formatCents(point.minBalanceCents)}</span>
          {point.firstNegativeDate
            ? ` — ficou negativo em ${formatDayLabel(point.firstNegativeDate, today)}.`
            : '.'}
        </p>
      ) : null}

      {point.isPartial ? (
        <p className="text-xs text-[var(--foreground-muted)]">
          Período incompleto: a janela começa ou termina no meio dele, então entrada e saída são
          parciais.
        </p>
      ) : null}

      {point.occurrences.length === 0 ? (
        <p className="text-sm text-[var(--foreground-muted)]">Nenhum lançamento aqui.</p>
      ) : (
        <ul className="divide-border divide-y">
          {point.occurrences.map((occurrence) => (
            <OccurrenceRow
              key={occurrence.key}
              occurrence={occurrence}
              today={today}
              showDate={point.dayCount > 1}
              editable={Boolean(entriesById[entryIdOf(occurrence) ?? ''])}
              onEdit={() => openEdit(entryIdOf(occurrence))}
              actions={renderActions?.(occurrence)}
            />
          ))}
        </ul>
      )}

      <Button
        type="button"
        variant="outline"
        className="min-h-11 justify-center gap-2"
        onClick={() => openCreate(true)}
      >
        <Plus className="size-4" aria-hidden />
        Lançar {point.dayCount === 1 ? 'neste dia' : 'neste período'}
      </Button>
    </PanelShell>
  )
}

/** A data que o formulário abre preenchida para um lançamento novo neste período. */
function defaultDateFor(point: BucketPoint, today: string): string {
  return point.from <= today && today <= point.to ? today : point.from
}

/**
 * O id da linha de `entries` por trás da ocorrência, quando existe.
 *
 * `Occurrence.key` é `entry:<id>` para lançamento manual e
 * `<source>:<sourceId>:<occurrenceKey>` para o que veio de um gerador. No segundo caso o id da
 * linha não está na chave — e pode nem existir, se a ocorrência ainda é só previsão. Quem
 * resolve isso é o mapa de lançamentos da janela, montado no servidor.
 */
export function entryIdOf(occurrence: Occurrence): string | null {
  return occurrence.key.startsWith('entry:') ? occurrence.key.slice('entry:'.length) : null
}

export function OccurrenceRow({
  occurrence,
  today,
  showDate,
  editable,
  onEdit,
  actions,
}: {
  occurrence: Occurrence
  today: string
  showDate: boolean
  editable: boolean
  onEdit: () => void
  actions?: React.ReactNode
}) {
  const marker =
    occurrence.origin === 'scenario'
      ? 'hipotético'
      : occurrence.isRealized
        ? occurrence.isSettled
          ? null
          : 'pendente'
        : 'previsto'

  const content = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{occurrence.description}</span>
        {showDate || marker ? (
          <span className="block truncate text-xs text-[var(--foreground-muted)]">
            {showDate ? formatDayLabel(occurrence.date, today) : ''}
            {showDate && marker ? ' · ' : ''}
            {marker ?? ''}
          </span>
        ) : null}
      </span>
      <Money cents={occurrence.amountCents} kind={occurrence.kind} className="shrink-0 text-sm" />
    </>
  )

  return (
    <li className="flex items-center gap-2">
      {editable ? (
        <button
          type="button"
          onClick={onEdit}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3 py-2 text-left"
        >
          {content}
        </button>
      ) : (
        <div className="flex min-h-11 min-w-0 flex-1 items-center gap-3 py-2">{content}</div>
      )}
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </li>
  )
}

function PanelShell({
  title,
  onBack,
  onClose,
  children,
}: {
  title: string
  onBack?: () => void
  onClose?: () => void
  children: React.ReactNode
}) {
  return (
    <aside className="flex flex-col gap-3 rounded-2xl bg-[var(--surface)] p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <div className="flex gap-1">
          {onBack ? (
            <Button
              type="button"
              variant="ghost"
              className="text-muted-foreground min-h-11 px-3 text-xs"
              onClick={onBack}
            >
              Voltar
            </Button>
          ) : null}
          {onClose ? (
            <Button
              type="button"
              variant="ghost"
              aria-label="Fechar detalhamento"
              className="text-muted-foreground min-h-11 px-3 text-xs"
              onClick={onClose}
            >
              Fechar
            </Button>
          ) : null}
        </div>
      </div>
      {children}
    </aside>
  )
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] text-[var(--foreground-muted)]">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}
