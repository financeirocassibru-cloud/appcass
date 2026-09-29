import { toast } from 'sonner'
import { createEntry, getEntryForEdit, updateEntry } from '@/lib/actions/entries'
import { setGoalMonthPlan, updateGoal } from '@/lib/actions/goals'
import { updateInstallmentPlan } from '@/lib/actions/installments'
import { setRecurringOccurrenceAmount, updateRecurring } from '@/lib/actions/recurring'
import { createScenarioEntry, setOverride, updateScenarioEntry } from '@/lib/actions/scenarios'
import type { GoalProgress } from '@/lib/db/queries/goals'
import type { SheetPlan, SheetRule } from '@/lib/db/queries/sheet'
import type { EntryKind } from '@/lib/db/types'
import type { ISODate } from '@/lib/finance/date'
import type { OverrideTargetRef } from '@/lib/finance/projection'

/**
 * As gravações da planilha — v1.0 — 28/09/2026 (Fase 14).
 *
 * Cada função monta o `FormData` com os mesmos nomes de campo do formulário da tela de origem e
 * chama a **mesma Server Action** (invariante 5): Zod, `.eq()` + `.select()` e `revalidatePath`
 * vêm de graça, e não existe um caminho de escrita da planilha. Devolvem `true` quando salvou;
 * o erro vai para um toast, com o texto que a action devolveu.
 *
 * Os campos que a célula não mostra (palavras-chave, "Pago com") **não** vão no formulário, e a
 * action os deixa como estão — "ausente não é vazio", a regra de `lib/validation/keywords.ts`.
 */

type Result = { error?: string; success?: string }

function form(fields: Record<string, string | number | null | undefined>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) data.set(key, String(value))
  }
  return data
}

function report(result: Result): boolean {
  if (result.error) {
    toast.error(result.error)
    return false
  }
  if (result.success) toast.success(result.success)
  return true
}

/** O valor de um lançamento que já existe; o resto dele fica como está. */
export async function saveEntryAmount(entryId: string, cents: number): Promise<boolean> {
  if (cents <= 0) {
    toast.error('Para tirar um lançamento, abra-o e exclua — valor zero não é gravado.')
    return false
  }
  const entry = await getEntryForEdit({ id: entryId })
  if (!entry) {
    toast.error('Lançamento não encontrado.')
    return false
  }
  return report(
    await updateEntry(
      {},
      form({
        id: entry.id,
        kind: entry.kind,
        amountCents: cents,
        occurredOn: entry.occurredOn,
        description: entry.description,
        categoryId: entry.category?.id ?? '',
        notes: entry.notes ?? '',
        isSettled: entry.isSettled ? 'true' : 'false',
      }),
    ),
  )
}

/** Um lançamento novo, criado na célula de uma categoria. */
export async function createEntryInCell(input: {
  kind: EntryKind
  cents: number
  date: ISODate
  description: string
  categoryId: string | null
  isSettled: boolean
}): Promise<boolean> {
  if (input.cents <= 0) return false
  return report(
    await createEntry(
      {},
      form({
        kind: input.kind,
        amountCents: input.cents,
        occurredOn: input.date,
        description: input.description,
        categoryId: input.categoryId ?? '',
        isSettled: input.isSettled ? 'true' : 'false',
      }),
    ),
  )
}

/** "Só este mês" da conta fixa prevista: materializa a ocorrência com o valor novo. */
export async function saveOccurrenceAmount(ruleId: string, occursOn: ISODate, cents: number): Promise<boolean> {
  if (cents <= 0) {
    toast.error('Para pular um mês, use um cenário — a conta fixa não aceita valor zero.')
    return false
  }
  return report(await setRecurringOccurrenceAmount({}, form({ ruleId, occursOn, amountCents: cents })))
}

/** "Todos os meses" da conta fixa: o valor da regra. */
export async function saveRuleAmount(rule: SheetRule, cents: number): Promise<boolean> {
  if (cents <= 0) {
    toast.error('Para parar uma conta fixa, desative-a — valor zero não é gravado.')
    return false
  }
  return report(
    await updateRecurring(
      {},
      form({
        id: rule.id,
        kind: rule.kind,
        description: rule.description,
        amountCents: cents,
        categoryId: rule.categoryId ?? '',
        frequency: rule.frequency,
        dayOfMonth: rule.frequency === 'monthly' ? (rule.dayOfMonth ?? '') : '',
        startsOn: rule.startsOn,
        endsOn: rule.endsOn ?? '',
      }),
    ),
  )
}

/** "Só este mês" da meta: o aporte previsto daquele mês. */
export async function saveGoalMonth(goalId: string, month: ISODate, cents: number): Promise<boolean> {
  return report(await setGoalMonthPlan({}, form({ goalId, month, amountCents: cents })))
}

/** "Todos os meses" da meta: o aporte mensal. Zero volta a derivar do prazo. */
export async function saveGoalMonthly(goal: GoalProgress, cents: number): Promise<boolean> {
  return report(
    await updateGoal(
      {},
      form({
        id: goal.id,
        name: goal.name,
        targetAmountCents: goal.targetAmountCents,
        targetDate: goal.targetDate ?? '',
        monthlyContributionCents: cents,
      }),
    ),
  )
}

/** O parcelamento inteiro com o valor novo da parcela (todas iguais). */
export async function savePlanInstallment(plan: SheetPlan, installmentCents: number): Promise<boolean> {
  if (installmentCents <= 0) return false
  return report(
    await updateInstallmentPlan(
      {},
      form({
        id: plan.id,
        description: plan.description,
        categoryId: plan.categoryId ?? '',
        totalAmountCents: installmentCents * plan.installmentsCount,
      }),
    ),
  )
}

/** Um ajuste do cenário. Zero tira o item do cenário. */
export async function saveScenarioOverride(
  scenarioId: string,
  target: OverrideTargetRef,
  scope: 'one' | 'all',
  cents: number,
): Promise<boolean> {
  return report(
    await setOverride(
      {},
      form({
        scenarioId,
        targetType: target.targetType,
        targetId: target.targetId,
        occurrenceKey: scope === 'one' ? (target.occurrenceKey ?? '') : '',
        isIncluded: cents > 0 ? 'true' : 'false',
        amountCents: cents > 0 ? cents : '',
      }),
    ),
  )
}

/** Um item que só existe no cenário: criar ou mudar o valor. */
export async function saveScenarioEntry(input: {
  scenarioId: string
  id?: string
  kind: EntryKind
  description: string
  cents: number
  occursOn: ISODate
  categoryId: string | null
}): Promise<boolean> {
  if (input.cents <= 0) return false
  const fields = {
    kind: input.kind,
    description: input.description,
    amountCents: input.cents,
    occursOn: input.occursOn,
    categoryId: input.categoryId ?? '',
  }
  return report(
    input.id
      ? await updateScenarioEntry({}, form({ id: input.id, ...fields }))
      : await createScenarioEntry({}, form({ scenarioId: input.scenarioId, ...fields })),
  )
}
