import { addMonths, clampDayToMonth, parseISODate, toISODate, type ISODate } from './date'
import { splitCents } from './money'
import type { EntryKind } from './types'

export interface InstallmentPlanInput {
  id: string
  description: string
  categoryId: string | null
  totalAmountCents: number
  installmentsCount: number
  firstDueOn: ISODate
}

/** Uma parcela, pronta para virar linha em `entries`. */
export interface PlannedInstallment {
  kind: EntryKind
  description: string
  amountCents: number
  dueOn: ISODate
  categoryId: string | null
  installmentNumber: number
  installmentTotal: number
  /** Número da parcela como string — é o `occurrence_key` da linha gerada. */
  occurrenceKey: string
}

/**
 * Gera as N parcelas de uma compra parcelada.
 *
 * Diferente do app antigo, as parcelas viram lançamentos reais no momento em
 * que o plano é criado, e não itens paralelos recalculados a cada tela. Duas
 * consequências: "parcelas pagas" passa a ser a contagem das que estão
 * liquidadas, e o rateio é cent-exato — a soma das parcelas devolvidas aqui é
 * sempre igual a `totalAmountCents`.
 *
 * O dia de vencimento acompanha o da primeira parcela, ajustado a cada mês:
 * uma compra que vence dia 31 cai em 28/02 (ou 29), não some.
 */
export function planInstallments(plan: InstallmentPlanInput): PlannedInstallment[] {
  const amounts = splitCents(plan.totalAmountCents, plan.installmentsCount)
  const anchorDay = parseISODate(plan.firstDueOn).day

  return amounts.map((amountCents, index) => {
    const monthDate = addMonths(plan.firstDueOn, index)
    const { year, month } = parseISODate(monthDate)
    const dueOn = toISODate({ year, month, day: clampDayToMonth(anchorDay, year, month) })
    const installmentNumber = index + 1

    return {
      kind: 'expense' as const,
      description: `${plan.description} (${installmentNumber}/${plan.installmentsCount})`,
      amountCents,
      dueOn,
      categoryId: plan.categoryId,
      installmentNumber,
      installmentTotal: plan.installmentsCount,
      occurrenceKey: String(installmentNumber),
    }
  })
}
