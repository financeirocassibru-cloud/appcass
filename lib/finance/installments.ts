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
  /**
   * Dia de vencimento de todas as parcelas. Ausente, é o dia de `firstDueOn`.
   *
   * v1.1 — 2026-09-27: existe para o parcelamento em andamento. Quem cadastra informa a
   * **próxima** parcela, e a primeira é calculada para trás; se a próxima vence dia 31 e a
   * primeira caiu num mês de 30, o dia da primeira (30) arrastaria todas para o dia 30.
   */
  anchorDay?: number
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
  const anchorDay = plan.anchorDay ?? parseISODate(plan.firstDueOn).day

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

/**
 * A primeira parcela de um parcelamento que já está em andamento.
 *
 * v1.1 — 2026-09-27. Quem cadastra uma compra antiga lembra da próxima fatura e de quantas
 * já pagou, não da data da primeira. A primeira é a próxima recuada `paidCount` meses, e o dia
 * de vencimento é o da próxima — devolvido junto, para ir como `anchorDay` a
 * `planInstallments()`. Prévia e Server Action chamam esta função, e por isso não divergem.
 */
export function firstDueFromNext(
  nextDueOn: ISODate,
  paidCount: number,
): { firstDueOn: ISODate; anchorDay: number } {
  return {
    firstDueOn: addMonths(nextDueOn, -paidCount),
    anchorDay: parseISODate(nextDueOn).day,
  }
}
