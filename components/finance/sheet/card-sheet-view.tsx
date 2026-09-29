'use client'

import { useMemo, useState } from 'react'
import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { SheetContext } from '@/lib/db/queries/sheet'
import type { EntryKind } from '@/lib/db/types'
import { billStatusLabel, type CreditAccount } from '@/lib/finance/credit'
import type { ISODate } from '@/lib/finance/date'
import { formatCents } from '@/lib/finance/money'
import type { CardSheet, CardSheetItem, CardSheetRow, SheetMonth } from '@/lib/finance/sheet'
import { RecurringForm } from '@/app/(app)/compromissos/form'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  CategoryRenameDialog,
  EntryDialog,
  InstallmentWarningDialog,
  PlanEditDialog,
  ScopeDialog,
} from './sheet-dialogs'
import { SheetGrid, type CellIntent, type CellTarget, type GridFooter, type GridRow, type GridSection } from './sheet-grid'
import { SheetToolbar, type SheetPatch, type ToolbarParams } from './sheet-toolbar'
import { saveEntryAmount, saveOccurrenceAmount, savePlanInstallment, saveRuleAmount } from './sheet-writes'

/**
 * A planilha de um cartão ou empréstimo — v1.0 — 28/09/2026 (Fase 14).
 *
 * Na principal a conta é uma linha só, a fatura. Aqui aparecem as compras, cada uma na fatura
 * em que cai (a coluna é o vencimento), e embaixo o total, o pago, o restante e a situação de
 * cada fatura — tudo derivado de `getCreditLedger`, nada gravado (invariante 18).
 *
 * Editar direto nela segue as regras da principal: a compra muda pelo `updateEntry` de sempre; a
 * conta fixa no cartão pergunta só este mês ou todos; a parcela avisa que muda todas. Uma compra
 * dividida em várias cobranças abre o formulário, porque o valor digitado seria de uma cobrança e
 * o que se grava é a compra inteira.
 */

type Dialog =
  | { type: 'none' }
  | { type: 'scope'; row: CardSheetRow; item: CardSheetItem; cents: number; month: SheetMonth }
  | { type: 'installment'; planId: string; cents: number }
  | { type: 'plan'; planId: string }
  | { type: 'rule'; ruleId: string }
  | { type: 'category'; id: string; name: string }
  | { type: 'entry'; entryId: string | null; categoryId?: string | null; date?: ISODate }
  | { type: 'cell'; row: CardSheetRow; month: SheetMonth }

export function CardSheetView({
  sheet,
  account,
  context,
  params,
  hrefFor,
  suggestions,
}: {
  sheet: CardSheet
  account: CreditAccount
  context: SheetContext
  params: ToolbarParams
  hrefFor: (patch: SheetPatch) => Route
  suggestions: Record<EntryKind, string[]>
}) {
  const router = useRouter()
  const [dialog, setDialog] = useState<Dialog>({ type: 'none' })
  const today = context.today
  const isCard = account.kind === 'card'

  const close = (changed = false) => {
    setDialog({ type: 'none' })
    if (changed) router.refresh()
  }

  const rowsByKey = useMemo(() => {
    const map = new Map<string, CardSheetRow>()
    for (const group of sheet.groups) for (const row of group.rows) map.set(row.key, row)
    return map
  }, [sheet])
  const plansById = useMemo(() => new Map(context.plans.map((p) => [p.id, p])), [context.plans])
  const rulesById = useMemo(() => new Map(context.rules.map((r) => [r.id, r])), [context.rules])

  const totals: Record<string, { cents: number }> = {}
  for (const month of sheet.months) {
    totals[month.key] = { cents: sheet.bills[month.key]?.totalCents ?? 0 }
  }

  const sections: GridSection[] = [
    {
      key: 'charges',
      title: isCard ? 'Compras e cobranças' : 'Cobranças',
      tone: null,
      groups: sheet.groups.map((group) => ({
        key: group.key,
        title: group.title,
        rows: group.rows.map((row) => toGridRow(row)),
      })),
      totalLabel: isCard ? 'Total da fatura' : 'Total do mês',
      totals,
      addLabel: isCard ? 'Nova compra neste cartão' : 'Novo uso deste empréstimo',
      onAdd: () => setDialog({ type: 'entry', entryId: null }),
    },
  ]

  const paid: Record<string, { cents: number } | null> = {}
  const remaining: Record<string, { cents: number } | null> = {}
  const carry: Record<string, { cents: number } | null> = {}
  const status: Record<string, string | undefined> = {}
  let hasCarry = false
  for (const month of sheet.months) {
    const bill = sheet.bills[month.key]
    paid[month.key] = bill ? { cents: bill.paidCents } : { cents: 0 }
    remaining[month.key] = bill ? { cents: bill.remainingCents } : { cents: 0 }
    carry[month.key] = bill ? { cents: bill.carryInCents } : { cents: 0 }
    if (bill && bill.carryInCents !== 0) hasCarry = true
    status[month.key] = bill ? billStatusLabel(bill.status, account.kind) : '—'
  }
  const footers: GridFooter[] = [
    ...(hasCarry ? [{ key: 'carry', label: 'Veio da anterior', values: carry, tone: 'neutral' as const }] : []),
    { key: 'paid', label: 'Pago', values: paid, tone: 'neutral' },
    { key: 'remaining', label: 'Falta pagar', values: remaining, tone: 'neutral' },
    { key: 'status', label: 'Situação', values: {}, tone: 'neutral', texts: status },
  ]

  function openRow(gridRow: GridRow) {
    const row = rowsByKey.get(gridRow.key)
    if (!row) return
    switch (row.kind) {
      case 'category':
        if (row.refId) setDialog({ type: 'category', id: row.refId, name: row.label })
        else toast.info('“Sem categoria” não é uma categoria — dá para escolher uma em cada compra.')
        return
      case 'entry':
        if (row.refId) setDialog({ type: 'entry', entryId: row.refId })
        return
      case 'recurring':
        if (row.refId && rulesById.has(row.refId)) setDialog({ type: 'rule', ruleId: row.refId })
        return
      case 'installment':
        if (row.refId) setDialog({ type: 'plan', planId: row.refId })
        return
      case 'carry':
        router.push(`/cartoes/${account.id}` as Route)
        return
      default:
        return
    }
  }

  function openCell(target: CellTarget): CellIntent {
    const row = rowsByKey.get(target.row.key)
    if (!row) return 'handled'
    const items = row.cells[target.month.key]?.items ?? []

    if (row.kind === 'carry') {
      toast.info('O parcelamento da fatura se ajusta na tela do cartão.')
      return 'handled'
    }
    if (items.length > 1) {
      setDialog({ type: 'cell', row, month: target.month })
      return 'handled'
    }
    const item = items[0]
    if (!item) {
      if (row.kind === 'category' || row.kind === 'entry') {
        setDialog({ type: 'entry', entryId: null, categoryId: row.kind === 'category' ? row.refId : null })
        return 'handled'
      }
      toast.info('Nada nesta fatura.')
      return 'handled'
    }
    // Uma compra em várias cobranças: o valor da célula é uma parte dela.
    if (item.total > 1 && item.source !== 'installment' && item.entryId) {
      setDialog({ type: 'entry', entryId: item.entryId })
      return 'handled'
    }
    return 'inline'
  }

  async function commitCell(target: CellTarget, cents: number): Promise<void> {
    const row = rowsByKey.get(target.row.key)
    const item = row?.cells[target.month.key]?.items[0]
    if (!row || !item || cents === item.amountCents) return

    if (row.kind === 'installment' && row.refId) {
      setDialog({ type: 'installment', planId: row.refId, cents })
      return
    }
    if (row.kind === 'recurring') {
      setDialog({ type: 'scope', row, item, cents, month: target.month })
      return
    }
    if (item.entryId && (await saveEntryAmount(item.entryId, cents))) router.refresh()
  }

  async function applyScope(scope: 'one' | 'all') {
    if (dialog.type !== 'scope') return
    const { row, item, cents } = dialog
    setDialog({ type: 'none' })
    const ruleId = row.refId
    if (!ruleId) return
    let saved = false
    if (scope === 'one') {
      saved = item.entryId ? await saveEntryAmount(item.entryId, cents) : await saveOccurrenceAmount(ruleId, item.occurredOn, cents)
    } else {
      const rule = rulesById.get(ruleId)
      saved = rule ? await saveRuleAmount(rule, cents) : false
    }
    if (saved) router.refresh()
  }

  const expenseCategories = context.categories.filter((c) => c.kind === 'expense' && c.archivedAt === null)
  const incomeCategories = context.categories.filter((c) => c.kind === 'income' && c.archivedAt === null)
  const cards = context.accounts.filter((a) => a.kind === 'card' && a.archivedAt === null).map((a) => ({ id: a.id, name: a.name }))
  const dialogRule = dialog.type === 'rule' ? rulesById.get(dialog.ruleId) : undefined
  const scope = dialog.type === 'scope' ? dialog : null

  return (
    <div className="flex flex-col gap-5">
      <SheetToolbar today={today} params={params} hrefFor={hrefFor} />

      <SheetGrid
        months={sheet.months}
        sections={sections}
        footers={footers}
        caption={`Planilha de ${account.name} por fatura`}
        onRowOpen={openRow}
        onCellOpen={openCell}
        onCellCommit={commitCell}
      />

      <p className="text-muted-foreground text-xs">
        Cada coluna é a fatura que vence naquele mês; a compra aparece na fatura em que cai. Dois cliques
        no nome editam o item; dois cliques numa célula digitam o valor.
      </p>

      <ScopeDialog
        open={scope !== null}
        title={scope ? `${scope.row.label}: ${formatCents(scope.cents)}` : ''}
        description="Mudar só esta fatura, ou a conta fixa inteira?"
        onlyThisHint={scope ? `Só a de ${scope.month.label}. As outras continuam com o valor de sempre.` : ''}
        allHint="Muda o valor da regra daqui para frente. O que já foi pago fica como está."
        onChoose={(choice) => void applyScope(choice)}
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
        createDefaults={
          dialog.type === 'entry' && dialog.entryId === null
            ? {
                kind: isCard ? 'expense' : 'income',
                categoryId: dialog.categoryId ?? null,
                creditAccountId: account.id,
                date: dialog.date ?? today,
                isSettled: false,
              }
            : undefined
        }
        categories={context.categories}
        creditAccounts={context.creditAccounts}
        today={today}
        onClose={close}
      />

      <Dialog open={dialog.type === 'rule'} onOpenChange={(open) => !open && close()}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Editar conta fixa</DialogTitle>
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

      <Dialog open={dialog.type === 'cell'} onOpenChange={(open) => !open && close()}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {dialog.type === 'cell' ? `${dialog.row.label} · ${dialog.month.label}` : ''}
            </DialogTitle>
            <DialogDescription>As cobranças desta fatura nesta linha.</DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col divide-y">
            {(dialog.type === 'cell' ? (dialog.row.cells[dialog.month.key]?.items ?? []) : []).map((item) => (
              <li key={item.key} className="flex items-center gap-3 py-2">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{item.description}</span>
                  <span className="text-muted-foreground text-xs">
                    compra em {item.occurredOn.split('-').reverse().join('/')}
                    {item.total > 1 ? ` · ${item.number} de ${item.total}` : ''}
                  </span>
                </div>
                <span className="text-sm tabular">{formatCents(item.amountCents)}</span>
                {item.entryId ? (
                  <Button size="sm" variant="outline" onClick={() => setDialog({ type: 'entry', entryId: item.entryId })}>
                    Editar
                  </Button>
                ) : item.ruleId ? (
                  <Button size="sm" variant="outline" onClick={() => setDialog({ type: 'rule', ruleId: item.ruleId! })}>
                    Editar regra
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function toGridRow(row: CardSheetRow): GridRow {
  const cells: Record<string, { cents: number; hasProjected?: boolean }> = {}
  for (const [month, cell] of Object.entries(row.cells)) {
    // A conta fixa no cartão ainda não materializada é previsão.
    cells[month] = { cents: cell.cents, hasProjected: cell.items.some((item) => item.entryId === null) }
  }
  const first = Object.values(row.cells)[0]?.items[0]
  const hint =
    row.kind === 'installment' || (row.kind === 'entry' && first && first.total > 1) ? `${first?.total ?? ''}x` : undefined
  return { key: row.key, label: row.label, hint, cells, totalCents: row.totalCents }
}
