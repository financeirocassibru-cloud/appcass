import { z } from 'zod'
import { isISODate } from '@/lib/finance/date'

/** O valor chega do formulário em centavos, como inteiro — nunca como texto decimal. */
const amountCentsSchema = z.coerce
  .number()
  .int('Valor inválido')
  .positive('Informe um valor maior que zero')
  .max(9_999_999_999, 'Valor acima do limite')

const isoDateSchema = z
  .string()
  .trim()
  .refine(isISODate, 'Data inválida')

const kindSchema = z.enum(['expense', 'income'])

/** `''` vira `null`: um `<select>` sem escolha manda string vazia. */
const optionalUuid = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .refine((value) => value === null || z.string().uuid().safeParse(value).success, 'Categoria inválida')

const optionalText = z
  .string()
  .trim()
  .max(500, 'Observação longa demais')
  .transform((value) => (value === '' ? null : value))

export const createEntrySchema = z.object({
  kind: kindSchema,
  amountCents: amountCentsSchema,
  occurredOn: isoDateSchema,
  description: z
    .string()
    .trim()
    .min(1, 'Informe a descrição')
    .max(120, 'Descrição longa demais'),
  categoryId: optionalUuid,
  notes: optionalText.optional(),
  // Checkbox ausente no FormData significa não marcado.
  isSettled: z
    .union([z.literal('on'), z.literal('true'), z.literal('false'), z.undefined(), z.null()])
    .transform((value) => value === 'on' || value === 'true'),
})

export const updateEntrySchema = createEntrySchema.extend({
  id: z.string().uuid('Lançamento inválido'),
})

export const entryIdSchema = z.object({
  id: z.string().uuid('Lançamento inválido'),
})

export const toggleSettledSchema = z.object({
  id: z.string().uuid('Lançamento inválido'),
  isSettled: z.union([z.literal('true'), z.literal('false')]).transform((v) => v === 'true'),
})

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome').max(40, 'Nome longo demais'),
  kind: kindSchema,
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida')
    .default('#7c3aed'),
})

export const renameCategorySchema = z.object({
  id: z.string().uuid('Categoria inválida'),
  name: z.string().trim().min(1, 'Informe o nome').max(40, 'Nome longo demais'),
})

export const archiveCategorySchema = z.object({
  id: z.string().uuid('Categoria inválida'),
  /** `true` arquiva, `false` restaura. */
  archive: z.union([z.literal('true'), z.literal('false')]).transform((v) => v === 'true'),
})

export type CreateEntryInput = z.infer<typeof createEntrySchema>
export type UpdateEntryInput = z.infer<typeof updateEntrySchema>
