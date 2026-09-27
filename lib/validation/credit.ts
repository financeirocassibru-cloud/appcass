import { z } from 'zod'
import { isISODate } from '@/lib/finance/date'
import { keywordsField } from '@/lib/validation/keywords'

/**
 * Cartões e empréstimos — v1.0 — 2026-09-27 (Fase 13).
 *
 * Dois grupos de schema: o cadastro da conta (`creditAccountSchema`) e os campos que um
 * lançamento, uma conta fixa ou um parcelamento ganham quando o dinheiro vem de uma conta
 * (`creditFieldsShape` + `checkCreditFields`).
 */

const uuid = (message: string) => z.string().uuid(message)

const dayField = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => (v === null || v === undefined || v.trim() === '' ? null : Number(v)))
  .refine((v) => v === null || (Number.isInteger(v) && v >= 1 && v <= 31), 'Dia entre 1 e 31')

const optionalDate = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => (v === null || v === undefined || v.trim() === '' ? null : v.trim()))
  .refine((v) => v === null || isISODate(v), 'Data inválida')

const optionalCents = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => (v === null || v === undefined || v.trim() === '' ? null : Number(v)))
  .refine(
    (v) => v === null || (Number.isInteger(v) && v > 0 && v <= 9_999_999_999),
    'Valor inválido',
  )

const accountBase = z.object({
  kind: z.enum(['card', 'loan']),
  name: z.string().trim().min(1, 'Dê um nome').max(60, 'Nome longo demais'),
  limitCents: optionalCents,
  closingDay: dayField,
  dueDay: dayField,
  dueOn: optionalDate,
  keywords: keywordsField,
})

function checkAccount(
  v: z.infer<typeof accountBase>,
  ctx: z.RefinementCtx,
): void {
  if (v.kind === 'card' && (v.closingDay === null || v.dueDay === null)) {
    ctx.addIssue({ code: 'custom', message: 'Informe o dia de fechamento e o de vencimento' })
  }
  if (v.kind === 'loan' && v.dueDay !== null && v.dueOn !== null) {
    ctx.addIssue({ code: 'custom', message: 'Escolha vencimento único ou dia fixo, não os dois' })
  }
}

export const creditAccountSchema = accountBase.superRefine(checkAccount)

export const updateCreditAccountSchema = accountBase
  .extend({ id: uuid('Cartão inválido') })
  .superRefine(checkAccount)

export const creditAccountIdSchema = z.object({ id: uuid('Cartão inválido') })

export const archiveCreditAccountSchema = z.object({
  id: uuid('Cartão inválido'),
  archive: z.union([z.literal('true'), z.literal('false')]).transform((v) => v === 'true'),
})

// ---------------------------------------------------------------------------------------
// Pagar e parcelar a fatura

export const payCreditBillSchema = z.object({
  accountId: uuid('Cartão inválido'),
  dueOn: z.string().trim().refine(isISODate, 'Vencimento inválido'),
  amountCents: z.coerce
    .number()
    .int('Valor inválido')
    .positive('Informe um valor maior que zero')
    .max(9_999_999_999, 'Valor acima do limite'),
  paidOn: z.string().trim().refine(isISODate, 'Data inválida'),
})

export const carryCreditBillSchema = z.object({
  accountId: uuid('Cartão inválido'),
  dueOn: z.string().trim().refine(isISODate, 'Vencimento inválido'),
  installments: z.coerce.number().int('Parcelas inválidas').min(1, 'Ao menos 1 parcela').max(360, 'No máximo 360 parcelas'),
  installmentCents: z.coerce
    .number()
    .int('Valor inválido')
    .positive('Informe o valor da parcela')
    .max(9_999_999_999, 'Valor acima do limite'),
})

// ---------------------------------------------------------------------------------------
// Os campos de "pago com" num lançamento

/**
 * `creditAccountId` segue a regra das palavras-chave: **ausente não é vazio**. Um formulário
 * que não tem o campo (o assistente, uma tela antiga) devolve `undefined` e a action não mexe;
 * `''` é "do saldo" e grava nulo.
 */
export const creditFieldsShape = {
  creditAccountId: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v === null || v === undefined ? undefined : v.trim() === '' ? null : v.trim()))
    .refine((v) => v === undefined || v === null || uuid('x').safeParse(v).success, 'Cartão inválido'),
  chargeFirstDueOn: optionalDate,
  chargeCount: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v === null || v === undefined || v.trim() === '' ? 1 : Number(v)))
    .refine((v) => Number.isInteger(v) && v >= 1 && v <= 360, 'Parcelas entre 1 e 360'),
  /** "Valor a pagar". Ausente = o mesmo valor. */
  chargeTotalCents: optionalCents,
}

interface CreditFieldsInput {
  amountCents: number
  creditAccountId?: string | null
  chargeFirstDueOn: string | null
  chargeCount: number
  chargeTotalCents: number | null
}

/** A mesma checagem para criar e editar (e para conta fixa e parcelamento, sem o valor). */
export function checkCreditFields(v: CreditFieldsInput, ctx: z.RefinementCtx): void {
  if (!v.creditAccountId) return
  if (v.chargeFirstDueOn === null) {
    ctx.addIssue({ code: 'custom', path: ['chargeFirstDueOn'], message: 'Informe quando será pago' })
  }
  if (v.chargeTotalCents !== null && v.chargeTotalCents < v.amountCents) {
    ctx.addIssue({
      code: 'custom',
      path: ['chargeTotalCents'],
      message: 'O valor a pagar não pode ser menor que o valor',
    })
  }
}

/**
 * As colunas de `entries` que a action grava. `{}` quando o formulário não mandou o campo;
 * do saldo (`null`), zera tudo — um lançamento que deixou de ser do cartão não carrega
 * vencimento nem juros.
 */
export function creditPatch(v: CreditFieldsInput): {
  credit_account_id?: string | null
  charge_first_due_on?: string | null
  charge_count?: number
  interest_cents?: number
} {
  if (v.creditAccountId === undefined) return {}
  if (v.creditAccountId === null) {
    return { credit_account_id: null, charge_first_due_on: null, charge_count: 1, interest_cents: 0 }
  }
  return {
    credit_account_id: v.creditAccountId,
    charge_first_due_on: v.chargeFirstDueOn,
    charge_count: v.chargeCount,
    interest_cents: v.chargeTotalCents === null ? 0 : v.chargeTotalCents - v.amountCents,
  }
}

/** Lê os quatro campos do FormData — criar e editar leem igual. */
export function readCreditFields(formData: FormData): Record<keyof typeof creditFieldsShape, FormDataEntryValue | null> {
  return {
    creditAccountId: formData.get('creditAccountId'),
    chargeFirstDueOn: formData.get('chargeFirstDueOn'),
    chargeCount: formData.get('chargeCount'),
    chargeTotalCents: formData.get('chargeTotalCents'),
  }
}
