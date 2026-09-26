import { z } from 'zod'
import { isISODate } from '@/lib/finance/date'

/**
 * Validação de conta fixa.
 *
 * O banco já tem as constraints (`amount_cents > 0`, `day_of_month between 1 and
 * 31`, `ends_on >= starts_on`). Elas continuam sendo a garantia — mas um erro de
 * constraint chega à tela como texto do Postgres em inglês. Estas regras existem
 * para o erro ser legível, não para substituir as do banco.
 */

const amountCentsSchema = z.coerce
  .number()
  .int('Valor inválido')
  .positive('Informe um valor maior que zero')
  .max(9_999_999_999, 'Valor acima do limite')

const isoDateSchema = z.string().trim().refine(isISODate, 'Data inválida')

const optionalIsoDate = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .refine((value) => value === null || isISODate(value), 'Data inválida')

const optionalUuid = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .refine(
    (value) => value === null || z.string().uuid().safeParse(value).success,
    'Categoria inválida',
  )

const baseRecurringSchema = z.object({
  kind: z.enum(['expense', 'income']),
  description: z.string().trim().min(1, 'Informe a descrição').max(120, 'Descrição longa demais'),
  amountCents: amountCentsSchema,
  categoryId: optionalUuid,
  frequency: z.enum(['monthly', 'weekly', 'yearly']),
  // `''` quando a frequência não é mensal: o campo nem aparece na tela.
  dayOfMonth: z
    .string()
    .trim()
    .transform((value) => (value === '' ? null : Number(value)))
    .refine(
      (value) => value === null || (Number.isInteger(value) && value >= 1 && value <= 31),
      'Dia do vencimento inválido',
    ),
  startsOn: isoDateSchema,
  endsOn: optionalIsoDate,
})

/**
 * Duas regras que só existem por causa da combinação dos campos, e por isso
 * moram aqui e não numa constraint de coluna.
 *
 * Escritas como predicados soltos para as duas variantes do schema (criar e
 * editar) usarem a mesma conta, sem um genérico que apagaria os tipos.
 */
interface RecurringShape {
  frequency: 'monthly' | 'weekly' | 'yearly'
  dayOfMonth: number | null
  startsOn: string
  endsOn: string | null
}

const windowIsValid = (data: RecurringShape) =>
  data.endsOn === null || data.endsOn >= data.startsOn

// Dia do mês só faz sentido em regra mensal. Numa semanal ou anual o vencimento
// sai da data de início, e guardar um dia solto ali criaria um campo que não
// governa nada — e que mentiria na próxima leitura.
const dayOfMonthFits = (data: RecurringShape) =>
  data.frequency === 'monthly' || data.dayOfMonth === null

const WINDOW_ERROR = { message: 'O fim não pode ser antes do início', path: ['endsOn'] }
const DAY_ERROR = {
  message: 'Dia do vencimento só se aplica a conta mensal',
  path: ['dayOfMonth'],
}

export const createRecurringSchema = baseRecurringSchema
  .refine(windowIsValid, WINDOW_ERROR)
  .refine(dayOfMonthFits, DAY_ERROR)

export const updateRecurringSchema = baseRecurringSchema
  .extend({ id: z.string().uuid('Conta fixa inválida') })
  .refine(windowIsValid, WINDOW_ERROR)
  .refine(dayOfMonthFits, DAY_ERROR)

export const recurringIdSchema = z.object({
  id: z.string().uuid('Conta fixa inválida'),
})

export const toggleRecurringSchema = z.object({
  id: z.string().uuid('Conta fixa inválida'),
  isActive: z.union([z.literal('true'), z.literal('false')]).transform((v) => v === 'true'),
})

export const materializeSchema = z.object({
  ruleId: z.string().uuid('Conta fixa inválida'),
  occursOn: isoDateSchema,
})
