import { z } from 'zod'
import { isISODate } from '@/lib/finance/date'
import { parseKeywords } from '@/lib/finance/keywords'

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

/**
 * Exclusão em lote, de "Ver todos". v1.0 — 2026-09-27.
 *
 * Por id (o que foi marcado na página) e/ou por importação inteira (`import_batch_id`), que
 * pode passar de uma página. Os tetos são de sanidade, não de regra: a página mostra 40
 * linhas e uma importação tem no máximo 1000.
 */
export const entrySelectionSchema = z
  .object({
    ids: z.array(z.string().uuid('Lançamento inválido')).max(500, 'Seleção grande demais').default([]),
    importBatchIds: z
      .array(z.string().uuid('Importação inválida'))
      .max(20, 'Importações demais de uma vez')
      .default([]),
  })
  .refine((v) => v.ids.length + v.importBatchIds.length > 0, 'Nada selecionado')

/** v1.1 — 2026-09-27: a seleção virou `entrySelectionSchema`, que "Categorizar" também usa. */
export const deleteEntriesSchema = entrySelectionSchema

/** Quantos lançamentos, no máximo, uma recategorização lê e grava de uma vez. */
export const MAX_RECATEGORIZE = 2_000

/**
 * O que a prévia de "Categorizar" confirmou: um par lançamento → categoria por linha.
 * v1.0 — 2026-09-27.
 */
export const applyCategoriesSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().uuid('Lançamento inválido'),
        categoryId: z.string().uuid('Categoria inválida'),
      }),
    )
    .min(1, 'Nada para aplicar')
    .max(MAX_RECATEGORIZE, 'Lançamentos demais de uma vez'),
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

/**
 * Palavras-chave de uma categoria. v1.0 — 2026-09-27.
 *
 * Chega como o texto do campo (separado por vírgula ou linha) e sai como a lista limpa de
 * `parseKeywords` — a mesma função que a tela usa para mostrar os chips, então o que a
 * pessoa vê é o que é gravado.
 */
export const updateCategoryKeywordsSchema = z.object({
  id: z.string().uuid('Categoria inválida'),
  keywords: z
    .string()
    .max(2_000, 'Palavras-chave demais')
    .transform((raw) => parseKeywords(raw)),
})

export const archiveCategorySchema = z.object({
  id: z.string().uuid('Categoria inválida'),
  /** `true` arquiva, `false` restaura. */
  archive: z.union([z.literal('true'), z.literal('false')]).transform((v) => v === 'true'),
})

export type CreateEntryInput = z.infer<typeof createEntrySchema>
export type UpdateEntryInput = z.infer<typeof updateEntrySchema>
