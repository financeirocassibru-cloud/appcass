import { z } from 'zod'
import { isISODate } from '@/lib/finance/date'
import { keywordsField } from '@/lib/validation/keywords'

/**
 * Validação de metas e aportes.
 *
 * A regra menos óbvia está no aporte: `goal_contributions.amount_cents` tem
 * `check (amount_cents <> 0)` — pode ser **negativo**. Tirar dinheiro da meta é
 * um aporte negativo, e não a exclusão de um aporte antigo; apagar o que entrou
 * para representar o que saiu perderia a história.
 *
 * Por isso o formulário manda a magnitude e o sentido em separado, como a tela
 * de âncora do saldo faz.
 *
 * v1.2 — 28/09/2026 (Fase 14): `goalMonthPlanSchema`, o mês fixado pela planilha.
 *
 * v1.1 — 2026-09-27: `keywords` na meta, e `goalContributionSchema` — o aporte registrado
 * pelo [+], que vira saída amarrada ao aporte (migration 0019).
 */

const optionalIsoDate = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .refine((value) => value === null || isISODate(value), 'Data inválida')

const centsSchema = z.coerce
  .number()
  .int('Valor inválido')
  .positive('Informe um valor maior que zero')
  .max(9_999_999_999, 'Valor acima do limite')

/** `''` vira null: sem aporte mensal definido, ele é derivado do prazo. */
const optionalCents = z
  .string()
  .trim()
  .transform((value) => (value === '' || value === '0' ? null : Number(value)))
  .refine(
    (value) => value === null || (Number.isInteger(value) && value > 0 && value <= 9_999_999_999),
    'Aporte mensal inválido',
  )

export const createGoalSchema = z.object({
  name: z.string().trim().min(1, 'Dê um nome à meta').max(60, 'Nome longo demais'),
  targetAmountCents: centsSchema,
  targetDate: optionalIsoDate,
  monthlyContributionCents: optionalCents,
  keywords: keywordsField,
})

export const updateGoalSchema = createGoalSchema.extend({
  id: z.string().uuid('Meta inválida'),
})

/**
 * v1.2 — 28/09/2026 (Fase 14): o aporte previsto de UM mês ("Só este mês", na planilha). Zero
 * vale — "este mês não guardo nada" — e o que falta vai para os outros meses.
 */
export const goalMonthPlanSchema = z.object({
  goalId: z.string().uuid('Meta inválida'),
  month: z.string().trim().refine(isISODate, 'Mês inválido'),
  amountCents: z.coerce
    .number()
    .int('Valor inválido')
    .min(0, 'Valor inválido')
    .max(9_999_999_999, 'Valor acima do limite'),
})

export const goalIdSchema = z.object({
  id: z.string().uuid('Meta inválida'),
})

export const archiveGoalSchema = z.object({
  id: z.string().uuid('Meta inválida'),
  /** `true` arquiva, `false` restaura. */
  archive: z.union([z.literal('true'), z.literal('false')]).transform((v) => v === 'true'),
})

export const createContributionSchema = z.object({
  goalId: z.string().uuid('Meta inválida'),
  amountCents: centsSchema,
  /** `true` para resgate: o valor entra negativo. */
  isWithdrawal: z
    .union([z.literal('true'), z.literal('false')])
    .transform((v) => v === 'true'),
  occurredOn: z.string().trim().refine(isISODate, 'Data inválida'),
  note: z
    .string()
    .trim()
    .max(200, 'Observação longa demais')
    .transform((value) => (value === '' ? null : value)),
})

export const contributionIdSchema = z.object({
  id: z.string().uuid('Aporte inválido'),
})

/** v1.1 — 2026-09-27: aporte como saída, pelo [+]. Sempre positivo: resgate é na tela da meta. */
export const goalContributionSchema = z.object({
  goalId: z.string().uuid('Escolha uma meta'),
  amountCents: centsSchema,
  occurredOn: z.string().trim().refine(isISODate, 'Data inválida'),
  note: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => (value ?? '').trim())
    .refine((value) => value.length <= 200, 'Observação longa demais')
    .transform((value) => (value === '' ? null : value)),
})
