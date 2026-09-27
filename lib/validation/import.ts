import { z } from 'zod'
import { isISODate } from '@/lib/finance/date'
import { MAX_DESCRIPTION, MAX_NOTES } from '@/lib/import/describe'
import { IMPORT_KEY_RE } from '@/lib/import/fingerprint'
import { MAX_IMPORT_ROWS } from '@/lib/import/types'

/**
 * Validação da importação de extrato. v1.0 — 2026-09-27.
 *
 * O servidor não confia no que o navegador leu do arquivo: cada linha passa de novo por aqui
 * antes de virar lançamento — valor inteiro de centavos (invariante 1), data `YYYY-MM-DD`
 * de calendário (invariante 2), textos nos limites das colunas, chave no formato do sha256.
 */

const isoDate = z.string().trim().refine(isISODate, 'Data inválida')

const kind = z.enum(['expense', 'income'])

export const importRowSchema = z.object({
  occurredOn: isoDate,
  kind,
  amountCents: z.number().int('Valor inválido').positive('Valor inválido').max(9_999_999_999, 'Valor acima do limite'),
  description: z.string().trim().min(1, 'Descrição vazia').max(MAX_DESCRIPTION, 'Descrição longa demais'),
  notes: z
    .string()
    .trim()
    .max(MAX_NOTES)
    .transform((v) => (v === '' ? null : v))
    .nullable(),
  categoryId: z.string().uuid('Categoria inválida').nullable(),
  importKey: z.string().regex(IMPORT_KEY_RE, 'Chave de importação inválida'),
})

export type ImportRowInput = z.infer<typeof importRowSchema>

export const commitImportSchema = z
  .array(importRowSchema)
  .min(1, 'Nenhum lançamento selecionado')
  .max(MAX_IMPORT_ROWS, `No máximo ${MAX_IMPORT_ROWS} lançamentos por importação`)

/** O que a conferência pede ao servidor antes de mostrar a lista: só o necessário. */
export const prepareRowSchema = z.object({
  occurredOn: isoDate,
  kind,
  amountCents: z.number().int().positive(),
  description: z.string().max(MAX_DESCRIPTION),
  importKey: z.string().regex(IMPORT_KEY_RE),
})

export const prepareImportSchema = z.array(prepareRowSchema).min(1).max(MAX_IMPORT_ROWS)

/** Grupos para a IA sugerir categoria: uma descrição curta por contraparte. */
export const suggestGroupSchema = z.object({
  key: z.string().min(1).max(200),
  description: z.string().min(1).max(MAX_DESCRIPTION),
  kind,
})

export const suggestGroupsSchema = z.array(suggestGroupSchema).min(1).max(300)
