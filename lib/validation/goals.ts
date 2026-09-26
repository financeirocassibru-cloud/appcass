import { z } from 'zod'
import { isISODate } from '@/lib/finance/date'

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
})

export const updateGoalSchema = createGoalSchema.extend({
  id: z.string().uuid('Meta inválida'),
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
