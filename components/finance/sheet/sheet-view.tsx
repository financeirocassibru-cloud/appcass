'use client'

import { useMemo, useState } from 'react'
import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { deleteScenarioEntry } from '@/lib/actions/scenarios'
import type { SheetContext } from '@/lib/db/queries/sheet'
import type { ScenarioSummary } from '@/lib/db/queries/scenarios'
import type { EntryKind } from '@/lib/db/types'
import type { ISODate } from '@/lib/finance/date'
import { formatCents } from '@/lib/finance/money'
import {
  dateInSheetMonth,
  overrideTargetOfItem,
  type Sheet,
  type SheetItem,
  type SheetMonth,
  type SheetRow,
} from '@/lib/finance/sheet'
import { GoalForm } from '@/app/(app)/metas/form'
import { RecurringForm } from '@/app/(app)/compromissos/form'
import { LaunchForm } from '@/components/finance/launch-form'
import { MoneyInput } from '@/components/finance/money-input'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  CategoryChips,
  CategoryRenameDialog,
  EntryDialog,
  InstallmentWarningDialog,
  PlanEditDialog,
  ScopeDialog,
} from './sheet-dialogs'
import { SheetGrid, type CellIntent, type CellTarget, type GridFooter, type GridRow, type GridSection } from './sheet-grid'
import { SheetToolbar, type SheetPatch, type ToolbarParams } from './sheet-toolbar'
import {
  createEntryInCell,
  saveEntryAmount,
  saveGoalMonth,
  saveGoalMonthly,
  saveOccurrenceAmount,
  savePlanInstallment,
  saveRuleAmount,
  saveScenarioEntry,
  saveScenarioOverride,
} from './sheet-writes'

/**
 * A planilha principal — v1.0 — 28/09/2026 (Fase 14).
 *
 * Aqui mora a regra do gesto: o que um duplo clique faz depende do que a linha é.
 *
 * | Linha | Duplo clique no nome | Duplo clique na célula |
 * |---|---|---|
 * | Categoria | renomear | digitar: cria (vazia) ou muda (um lançamento); vários abrem a lista |
 * | Lançamento (desagrupado) | editar | digitar o valor |
 * | Conta/renda fixa | editar a regra | digitar, e perguntar: só este mês ou todos |
 * | Parcelamento | editar o plano | digitar, e avisar que muda todas |
 * | Meta | editar a meta | digitar, e perguntar: só este mês ou todos |
 * | Cartão/empréstimo | abrir a planilha dele | abrir a planilha dele |
 *
 * Com um cenário escolhido, a célula de hoje em diante grava **no cenário** (`setOverride`,
 * `createScenarioEntry`) e nunca em `entries` — o cenário 8 da ARCHITECTURE. O passado não é
 * hipótese: com cenário, a célula de um mês que passou não edita.
 */

type Dialog =
  | { type: 'none' }
  | { type: 'scope'; row: SheetRow; month: SheetMonth; item: SheetItem | null; cents: number }
  | { type: 'installment'; planId: string; cents: number }
  | { type: 'plan'; planId: string }
  | { type: 'rule'; ruleId: string }
  | { type: 'goal'; goalId: string }
  | { type: 'category'; id: string; name: string }
  | {
      type: 'entry'
      entryId: string | null
      defaults?: { kind: EntryKind; categoryId?: string | null; date: ISODate; isSettled?: boolean }
    }
  | { type: 'cell'; row: SheetRow; month: SheetMonth }
  | { type: 'launch'; kind: EntryKind }
  | {
      type: 'scenario-entry'
      itemId: string | null
      kind: EntryKind
      description: string
      cents: number
      date: ISODate
      categoryId: string | null
    }

export function SheetView({
  sheet,
  context,
  params,
  hrefFor,
  cardHref,
  scenarios,
  scenarioName,
  suggestions,
}: {
  sheet: Sheet
  context: SheetContext
  params: ToolbarParams
  hrefFor: (patch: SheetPatch) => Route
  cardHref: (accountId: string) => Route
  scenarios: ScenarioSummary[]
  scenarioName: string | null
  suggestions: Record<EntryKind, string[]>
}) {
  const router = useRouter()
  const [dialog, setDialog] = useState<Dialog>({ type: 'none' })
  const today = context.today
  const scenarioId = sheet.hasScenario ? (params.scenarioId ?? null) : null

  const close = (changed = false) => {
    setDialog({ type: 'none' })
    if (changed) router.refresh()
  }

  // A linha da planilha por trás de cada linha da grade.
  const rowsByKey = useMemo(() => {
    const map = new Map<string, SheetRow>()
    for (const section of [sheet.income, sheet.expense]) {
      for (const group of section.groups) for (const row of group.rows) map.set(row.key, row)
    }
    return map
  }, [sheet])

  const plansById = useMemo(() => new Map(context.plans.map((p) => [p.id, p])), [context.plans])
  const rulesById = useMemo(() => new Map(context.rules.map((r) => [r.id, r])), [context.rules])
  const goalsById = useMemo(() => new Map(context.goals.map((g) => [g.id, g])), [context.goals])

  const sections: GridSection[] = [sheet.income, sheet.expense].map((section) => ({
    key: section.kind,
    title: section.kind === 'income' ? 'Receitas' : 'Despesas',
    tone: section.kind,
    groups: section.groups.map((group) => ({
      key: group.key,
      title: group.title,
      rows: group.rows.map((row) => toGridRow(row, plansById)),
    })),
    totalLabel: section.kind === 'income' ? 'Total de receitas' : 'Total de despesas',
    totals: section.totals,
    addLabel: scenarioId
      ? section.kind === 'income'
        ? 'Nova entrada no cenário'
        : 'Nova saída no cenário'
      : section.kind === 'income'
        ? 'Nova entrada'
        : 'Nova saída',
    onAdd: () =>
      scenarioId
        ? setDialog({
            type: 'scenario-entry',
            itemId: null,
            kind: section.kind,
            description: '',
            cents: 0,
            date: today,
            categoryId: null,
          })
        : setDialog({ type: 'launch', kind: section.kind }),
  }))

  const footers: GridFooter[] = [
    { key: 'leftover', label: 'Quanto sobrou', values: sheet.leftover, tone: 'signed' },
    { key: 'balance', label: 'Saldo no fim do mês', values: sheet.closingBalance, tone: 'signed' },
  ]

  // ------------------------------------------------------------------ o gesto

  function openRow(gridRow: GridRow) {
    const row = rowsByKey.get(gridRow.key)
    if (!row) return
    switch (row.kind) {
      case 'category':
        if (!row.refId) {
          toast.info('“Sem categoria” não é uma categoria — dá para escolher uma em cada lançamento.')
          return
        }
        setDialog({ type: 'category', id: row.refId, name: row.label })
        return
      case 'entry':
        if (row.refId) setDialog({ type: 'entry', entryId: row.refId })
        return
      case 'recurring':
        if (row.refId && rulesById.has(row.refId)) setDialog({ type: 'rule', ruleId: row.refId })
        else toast.info('Esta conta fixa foi excluída; os lançamentos dela continuam no Histórico.')
        return
      case 'installment':
        if (row.refId) setDialog({ type: 'plan', planId: row.refId })
        return
      case 'goal':
        if (row.refId) setDialog({ type: 'goal', goalId: row.refId })
        return
      case 'credit':
        if (row.refId) router.push(cardHref(row.refId))
        return
      case 'scenario': {
        const item = firstItem(row)
        if (item && scenarioId) setDialog(scenarioEntryDialog(item))
        return
      }
      default:
        return
    }
  }

  function scenarioEntryDialog(item: SheetItem): Dialog {
    return {
      type: 'scenario-entry',
      itemId: item.sourceId,
      kind: item.kind,
      description: item.description,
      cents: item.amountCents,
      date: item.date,
      categoryId: item.categoryId,
    }
  }

  function openCell(target: CellTarget): CellIntent {
    const row = rowsByKey.get(target.row.key)
    if (!row) return 'handled'
    const month = target.month
    const items = row.cells[month.key]?.items ?? []

    if (row.kind === 'credit') {
      if (row.refId) router.push(cardHref(row.refId))
      return 'handled'
    }

    if (scenarioId) {
      if (month.isPast) {
        toast.info('O cenário muda só de hoje em diante. Para mexer no que já aconteceu, saia do cenário.')
        return 'handled'
      }
      const future = items.filter((item) => item.date >= today)
      if (future.length > 1) {
        setDialog({ type: 'cell', row, month })
        return 'handled'
      }
      if (future.length === 0 && row.kind !== 'category') {
        toast.info('Nada previsto neste mês para ajustar no cenário.')
        return 'handled'
      }
      return 'inline'
    }

    if (row.kind === 'category') {
      if (items.length > 1) {
        setDialog({ type: 'cell', row, month })
        return 'handled'
      }
      return 'inline'
    }
    if (row.kind === 'entry') return 'inline'
    if (items.length > 1) {
      setDialog({ type: 'cell', row, month })
      return 'handled'
    }
    if (items.length === 0) {
      // Meta: um mês sem aporte previsto dentro do prazo ainda pode receber um.
      if (row.kind === 'goal' && !month.isPast) return 'inline'
      toast.info('Nada neste mês.')
      return 'handled'
    }
    return 'inline'
  }

  async function commitCell(target: CellTarget, cents: number): Promise<void> {
    const row = rowsByKey.get(target.row.key)
    if (!row) return
    const month = target.month
    const cell = row.cells[month.key]
    const items = (cell?.items ?? []).filter((item) => !scenarioId || item.date >= today)
    const item = items[0] ?? null
    if (cell && cents === cell.cents) return

    // --- com cenário: nada vai para `entries`.
    if (scenarioId) {
      if (!item) {
        const date = dateInSheetMonth(month, today)
        if (
          await saveScenarioEntry({
            scenarioId,
            kind: row.section,
            description: row.label,
            cents,
            occursOn: date < today ? today : date,
            categoryId: row.kind === 'category' ? row.refId : null,
          })
        )
          router.refresh()
        return
      }
      if (item.origin === 'scenario') {
        if (item.sourceId && cents <= 0) {
          const data = new FormData()
          data.set('id', item.sourceId)
          const result = await deleteScenarioEntry({}, data)
          if (result.error) toast.error(result.error)
          else router.refresh()
          return
        }
        if (
          await saveScenarioEntry({
            scenarioId,
            id: item.sourceId ?? undefined,
            kind: item.kind,
            description: item.description,
            cents,
            occursOn: item.date,
            categoryId: item.categoryId,
          })
        )
          router.refresh()
        return
      }
      if (row.kind === 'recurring' || row.kind === 'goal') {
        setDialog({ type: 'scope', row, month, item, cents })
        return
      }
      if (await saveScenarioOverride(scenarioId, overrideTargetOfItem(item), 'one', cents)) router.refresh()
      return
    }

    // --- o real.
    switch (row.kind) {
      case 'category': {
        if (item?.entryId) {
          if (await saveEntryAmount(item.entryId, cents)) router.refresh()
          return
        }
        const date = dateInSheetMonth(month, today)
        if (
          await createEntryInCell({
            kind: row.section,
            cents,
            date,
            description: row.refId ? row.label : row.section === 'income' ? 'Entrada' : 'Saída',
            categoryId: row.refId,
            isSettled: date <= today,
          })
        )
          router.refresh()
        return
      }
      case 'entry':
        if (item?.entryId && (await saveEntryAmount(item.entryId, cents))) router.refresh()
        return
      case 'installment':
        if (row.refId) setDialog({ type: 'installment', planId: row.refId, cents })
        return
      case 'recurring':
      case 'goal':
        setDialog({ type: 'scope', row, month, item, cents })
        return
      default:
        return
    }
  }

  async function applyScope(scope: 'one' | 'all') {
    if (dialog.type !== 'scope') return
    const { row, month, item, cents } = dialog
    setDialog({ type: 'none' })
    let saved = false

    if (scenarioId) {
      if (item) saved = await saveScenarioOverride(scenarioId, overrideTargetOfItem(item), scope, cents)
    } else if (row.kind === 'recurring' && row.refId) {
      if (scope === 'one') {
        saved = item?.entryId
          ? await saveEntryAmount(item.entryId, cents)
          : item
            ? await saveOccurrenceAmount(row.refId, item.date, cents)
            : false
      } else {
        const rule = rulesById.get(row.refId)
        saved = rule ? await saveRuleAmount(rule, cents) : false
      }
    } else if (row.kind === 'goal' && row.refId) {
      if (scope === 'one') {
        saved = item?.entryId ? await saveEntryAmount(item.entryId, cents) : await saveGoalMonth(row.refId, month.from, cents)
      } else {
        const goal = goalsById.get(row.refId)
        saved = goal ? await saveGoalMonthly(goal, cents) : false
      }
    }
    if (saved) router.refresh()
  }

  // ------------------------------------------------------------------ janelas

  const scopeRow = dialog.type === 'scope' ? dialog.row : null
  const scopeTexts = scopeRow ? scopeCopy(scopeRow, dialog.type === 'scope' ? dialog : null, Boolean(scenarioId)) : null

  const expenseCategories = context.categories.filter((c) => c.kind === 'expense' && c.archivedAt === null)
  const incomeCategories = context.categories.filter((c) => c.kind === 'income' && c.archivedAt === null)
  const activeCredit = context.creditAccounts.filter((a) => a.archivedAt === null)
  const cards = context.accounts.filter((a) => a.kind === 'card' && a.archivedAt === null).map((a) => ({ id: a.id, name: a.name }))

  const dialogRule = dialog.type === 'rule' ? rulesById.get(dialog.ruleId) : undefined
  const dialogGoal = dialog.type === 'goal' ? goalsById.get(dialog.goalId) : undefined

  return (
    <div className="flex flex-col gap-5">
      <SheetToolbar today={today} params={params} hrefFor={hrefFor} scenarios={scenarios} />

      {scenarioName ? (
        <p className="rounded-lg border border-[var(--brand)] px-4 py-2 text-sm">
          Mostrando o cenário <strong>{scenarioName}</strong>. Os valores em destaque são do cenário, com o
          real riscado embaixo; o que você digitar de hoje em diante fica <strong>só no cenário</strong>.
        </p>
      ) : null}

      <SheetGrid
        months={sheet.months}
        sections={sections}
        footers={footers}
        showReal={sheet.hasScenario}
        caption="Planilha de receitas e despesas por mês"
        onRowOpen={openRow}
        onCellOpen={openCell}
        onCellCommit={commitCell}
      />

      <p className="text-muted-foreground text-xs">
        Dois cliques no nome editam o item; dois cliques (ou Enter) numa célula digitam o valor, e Enter
        salva. Em itálico, o que ainda é previsão; o círculo marca o que está pendente. Cartões e
        empréstimos aparecem numa linha só, com o que sai do saldo — dois cliques abrem a planilha do
        cartão.
      </p>

      {/* --- As janelas */}

      <ScopeDialog
        open={dialog.type === 'scope'}
        title={scopeTexts?.title ?? ''}
        description={scopeTexts?.description ?? ''}
        onlyThisHint={scopeTexts?.one ?? ''}
        allHint={scopeTexts?.all ?? ''}
        onChoose={(scope) => void applyScope(scope)}
        onCancel={() => close()}
      />

      <InstallmentWarningDialog
        open={dialog.type === 'installment'}
        plan={dialog.type === 'installment' ? (plansById.get(dialog.planId) ?? null) : null}
        newInstallmentCents={dialog.type === 'installment' ? dialog.cents : 0}
        onCancel={() => close()}
        onConfirm={async () => {
          if (dialog.type !== 'installment') return
          const plan = plansById.get(dialog.planId)
          const cents = dialog.cents
          setDialog({ type: 'none' })
          if (plan && (await savePlanInstallment(plan, cents))) router.refresh()
        }}
      />

      <PlanEditDialog
        open={dialog.type === 'plan'}
        plan={dialog.type === 'plan' ? (plansById.get(dialog.planId) ?? null) : null}
        categories={expenseCategories}
        onClose={close}
      />

      <CategoryRenameDialog
        open={dialog.type === 'category'}
        category={dialog.type === 'category' ? { id: dialog.id, name: dialog.name } : null}
        onClose={close}
      />

      <EntryDialog
        open={dialog.type === 'entry'}
        entryId={dialog.type === 'entry' ? dialog.entryId : null}
        createDefaults={dialog.type === 'entry' ? dialog.defaults : undefined}
        categories={context.categories}
        creditAccounts={context.creditAccounts}
        today={today}
        onClose={close}
      />

      <Dialog open={dialog.type === 'rule'} onOpenChange={(open) => !open && close()}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{dialogRule?.kind === 'income' ? 'Editar renda fixa' : 'Editar conta fixa'}</DialogTitle>
            <DialogDescription>Vale da próxima ocorrência em diante; o que já foi pago fica como está.</DialogDescription>
          </DialogHeader>
          {dialogRule ? (
            <RecurringForm
              key={dialogRule.id}
              rule={dialogRule}
              categories={dialogRule.kind === 'income' ? incomeCategories : expenseCategories}
              suggestions={suggestions[dialogRule.kind]}
              cards={cards}
              onDone={() => close(true)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={dialog.type === 'goal'} onOpenChange={(open) => !open && close()}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Editar meta</DialogTitle>
            <DialogDescription>
              Para mudar o aporte de um mês só, dê dois cliques na célula daquele mês.
            </DialogDescription>
          </DialogHeader>
          {dialogGoal ? (
            <GoalForm
              key={dialogGoal.id}
              today={today}
              goal={dialogGoal}
              suggestions={suggestions.expense}
              onDone={() => close(true)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={dialog.type === 'launch'} onOpenChange={(open) => !open && close()}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Novo lançamento</DialogTitle>
            <DialogDescription>Avulso, conta fixa, parcelado, meta — o mesmo do botão Novo lançamento.</DialogDescription>
          </DialogHeader>
          {dialog.type === 'launch' ? (
            <LaunchForm
              key={dialog.kind}
              expenseCategories={expenseCategories}
              incomeCategories={incomeCategories}
              today={today}
              initialKind={dialog.kind}
              goals={context.goals
                .filter((g) => g.archivedAt === null)
                .map((g) => ({ id: g.id, name: g.name, savedCents: g.savedCents, targetAmountCents: g.targetAmountCents }))}
              suggestions={suggestions}
              creditAccounts={activeCredit}
              onSaved={() => close(true)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <CellItemsDialog
        open={dialog.type === 'cell'}
        row={dialog.type === 'cell' ? dialog.row : null}
        month={dialog.type === 'cell' ? dialog.month : null}
        today={today}
        scenarioId={scenarioId}
        onClose={close}
        onEditEntry={(entryId) => setDialog({ type: 'entry', entryId })}
        onEditScenarioItem={(item) => setDialog(scenarioEntryDialog(item))}
        onEditRule={(ruleId) => setDialog({ type: 'rule', ruleId })}
        onAdd={(row, month) => {
          const date = dateInSheetMonth(month, today)
          if (scenarioId) {
            setDialog({
              type: 'scenario-entry',
              itemId: null,
              kind: row.section,
              description: row.kind === 'category' && row.refId ? row.label : '',
              cents: 0,
              date: date < today ? today : date,
              categoryId: row.kind === 'category' ? row.refId : null,
            })
          } else {
            setDialog({
              type: 'entry',
              entryId: null,
              defaults: {
                kind: row.section,
                categoryId: row.kind === 'category' ? row.refId : null,
                date,
                isSettled: date <= today,
              },
            })
          }
        }}
      />

      <ScenarioEntryDialog
        open={dialog.type === 'scenario-entry'}
        value={dialog.type === 'scenario-entry' ? dialog : null}
        scenarioId={scenarioId}
        today={today}
        categories={context.categories.filter((c) => c.archivedAt === null)}
        onClose={close}
      />
    </div>
  )
}

function firstItem(row: SheetRow): SheetItem | null {
  for (const cell of Object.values(row.cells)) {
    const item = cell.items[0]
    if (item) return item
  }
  return null
}

function toGridRow(row: SheetRow, plans: Map<string, { installmentsCount: number }>): GridRow {
  const hint =
    row.kind === 'installment' && row.refId && plans.get(row.refId)
      ? `${plans.get(row.refId)?.installmentsCount}x`
      : row.kind === 'scenario'
        ? 'cenário'
        : undefined
  return { key: row.key, label: row.label, hint, cells: row.cells, totalCents: row.totalCents }
}

function scopeCopy(
  row: SheetRow,
  dialog: { month: SheetMonth; cents: number } | null,
  inScenario: boolean,
): { title: string; description: string; one: string; all: string } {
  const value = dialog ? formatCents(dialog.cents) : ''
  const month = dialog?.month.label ?? ''
  if (inScenario) {
    return {
      title: `${row.label}: ${value} no cenário`,
      description: 'O cenário muda só a projeção — nenhum lançamento real é alterado.',
      one: `Só em ${month}, no cenário.`,
      all: 'Em todos os meses do cenário, de hoje em diante.',
    }
  }
  if (row.kind === 'goal') {
    return {
      title: `${row.label}: ${value}`,
      description: 'Mudar o aporte de um mês só, ou o aporte de todos os meses?',
      one: `Só ${month}. O que falta para a meta é redistribuído pelos outros meses.`,
      all: 'Vira o aporte mensal da meta. Zero volta a dividir o que falta pelo prazo.',
    }
  }
  return {
    title: `${row.label}: ${value}`,
    description:
      row.section === 'income'
        ? 'Mudar só este mês, ou a renda fixa inteira?'
        : 'Mudar só este mês, ou a conta fixa inteira?',
    one: `Só ${month}. Os outros meses continuam com o valor de sempre.`,
    all: 'Muda o valor da regra daqui para frente. O que já foi pago fica como está.',
  }
}

/** Os lançamentos de uma célula com mais de um — cada um editável. */
function CellItemsDialog({
  open,
  row,
  month,
  today,
  scenarioId,
  onClose,
  onEditEntry,
  onEditScenarioItem,
  onEditRule,
  onAdd,
}: {
  open: boolean
  row: SheetRow | null
  month: SheetMonth | null
  today: ISODate
  scenarioId: string | null
  onClose: (changed?: boolean) => void
  onEditEntry: (entryId: string) => void
  onEditScenarioItem: (item: SheetItem) => void
  onEditRule: (ruleId: string) => void
  onAdd: (row: SheetRow, month: SheetMonth) => void
}) {
  const router = useRouter()
  const items = row && month ? (row.cells[month.key]?.items ?? []) : []
  const sorted = [...items].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {row?.label} · {month?.label}
          </DialogTitle>
          <DialogDescription>
            {scenarioId
              ? 'Ajuste cada item no cenário — os lançamentos reais não mudam.'
              : 'Os lançamentos deste mês nesta linha.'}
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col divide-y">
          {sorted.map((item) => (
            <li key={item.key} className="flex items-center gap-3 py-2">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{item.description}</span>
                <span className="text-muted-foreground text-xs">
                  {item.date.split('-').reverse().join('/')} ·{' '}
                  {item.origin === 'scenario'
                    ? 'só no cenário'
                    : !item.isRealized
                      ? 'previsto'
                      : item.isSettled
                        ? 'pago'
                        : 'pendente'}
                </span>
              </div>
              {scenarioId && item.origin !== 'scenario' && item.date >= today && item.origin !== 'bill' ? (
                <ScenarioItemAdjust
                  item={item}
                  scenarioId={scenarioId}
                  onSaved={() => {
                    onClose()
                    router.refresh()
                  }}
                />
              ) : (
                <>
                  <span className="text-sm tabular">{formatCents(item.amountCents)}</span>
                  {item.origin === 'scenario' ? (
                    <Button size="sm" variant="outline" onClick={() => onEditScenarioItem(item)}>
                      Editar
                    </Button>
                  ) : item.entryId && !scenarioId ? (
                    <Button size="sm" variant="outline" onClick={() => onEditEntry(item.entryId!)}>
                      Editar
                    </Button>
                  ) : item.origin === 'recurring' && item.sourceId && !scenarioId ? (
                    <Button size="sm" variant="outline" onClick={() => onEditRule(item.sourceId!)}>
                      Editar regra
                    </Button>
                  ) : null}
                </>
              )}
            </li>
          ))}
        </ul>
        {row && month && (row.kind === 'category' || row.kind === 'entry' || row.kind === 'scenario') && (!scenarioId || !month.isPast) ? (
          <Button variant="outline" onClick={() => onAdd(row, month)}>
            {scenarioId ? 'Adicionar ao cenário neste mês' : 'Adicionar neste mês'}
          </Button>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

/** Um item real, ajustado só no cenário: novo valor, ou fora dele. */
function ScenarioItemAdjust({
  item,
  scenarioId,
  onSaved,
}: {
  item: SheetItem
  scenarioId: string
  onSaved: () => void
}) {
  const [cents, setCents] = useState(item.amountCents)
  const [busy, setBusy] = useState(false)
  const target = overrideTargetOfItem(item)
  return (
    <div className="flex items-center gap-2">
      <div className="w-32">
        <MoneyInput cell name={null} label={`Valor no cenário de ${item.description}`} initialCents={item.amountCents} onCentsChange={setCents} />
      </div>
      <Button
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          const ok = await saveScenarioOverride(scenarioId, target, 'one', cents)
          setBusy(false)
          if (ok) onSaved()
        }}
      >
        Aplicar
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          const ok = await saveScenarioOverride(scenarioId, target, 'one', 0)
          setBusy(false)
          if (ok) onSaved()
        }}
      >
        Tirar
      </Button>
    </div>
  )
}

/** Criar, mudar ou excluir um item que só existe no cenário. */
function ScenarioEntryDialog({
  open,
  value,
  scenarioId,
  today,
  categories,
  onClose,
}: {
  open: boolean
  value: {
    itemId: string | null
    kind: EntryKind
    description: string
    cents: number
    date: ISODate
    categoryId: string | null
  } | null
  scenarioId: string | null
  today: ISODate
  categories: SheetContext['categories']
  onClose: (changed?: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{value?.itemId ? 'Item do cenário' : 'Novo item no cenário'}</DialogTitle>
          <DialogDescription>Existe só neste cenário — nenhum lançamento real é criado.</DialogDescription>
        </DialogHeader>
        {value && scenarioId ? (
          <ScenarioEntryForm
            key={value.itemId ?? `novo:${value.date}:${value.categoryId ?? ''}`}
            value={value}
            scenarioId={scenarioId}
            today={today}
            categories={categories.filter((c) => c.kind === value.kind)}
            onDone={() => onClose(true)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function ScenarioEntryForm({
  value,
  scenarioId,
  today,
  categories,
  onDone,
}: {
  value: {
    itemId: string | null
    kind: EntryKind
    description: string
    cents: number
    date: ISODate
    categoryId: string | null
  }
  scenarioId: string
  today: ISODate
  categories: SheetContext['categories']
  onDone: () => void
}) {
  const [description, setDescription] = useState(value.description)
  const [cents, setCents] = useState(value.cents)
  const [date, setDate] = useState(value.date)
  const [categoryId, setCategoryId] = useState(value.categoryId ?? '')
  const [busy, setBusy] = useState(false)

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={async (event) => {
        event.preventDefault()
        if (!description.trim()) {
          toast.error('Informe a descrição.')
          return
        }
        setBusy(true)
        const ok = await saveScenarioEntry({
          scenarioId,
          id: value.itemId ?? undefined,
          kind: value.kind,
          description: description.trim(),
          cents,
          occursOn: date,
          categoryId: categoryId || null,
        })
        setBusy(false)
        if (ok) onDone()
      }}
    >
      <MoneyInput name={null} compact label="Valor" initialCents={value.cents} onCentsChange={setCents} autoFocus />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cenario-descricao">Descrição</Label>
        <Input
          id="cenario-descricao"
          value={description}
          maxLength={120}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={value.kind === 'expense' ? 'Viagem' : 'Bônus'}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cenario-data">Data</Label>
        <Input
          id="cenario-data"
          type="date"
          value={date}
          min={today}
          onChange={(event) => event.target.value && setDate(event.target.value)}
        />
        <p className="text-muted-foreground text-xs">O cenário vale de hoje em diante.</p>
      </div>
      <CategoryChips categories={categories} value={categoryId} onChange={setCategoryId} />
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || cents <= 0} className="flex-1">
          {busy ? 'Salvando…' : 'Salvar no cenário'}
        </Button>
        {value.itemId ? (
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              const data = new FormData()
              data.set('id', value.itemId!)
              const result = await deleteScenarioEntry({}, data)
              setBusy(false)
              if (result.error) toast.error(result.error)
              else {
                toast.success('Item removido do cenário.')
                onDone()
              }
            }}
          >
            Excluir
          </Button>
        ) : null}
      </div>
    </form>
  )
}
