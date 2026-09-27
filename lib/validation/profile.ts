import { z } from 'zod'
import { isISODate } from '@/lib/finance/date'
import { ANALYSIS_PERIODS } from '@/lib/finance/periods'

/**
 * A âncora do saldo aceita valor **zero e negativo**, diferente de um
 * lançamento: quem está no vermelho tem saldo negativo, e quem zerou a conta
 * tem zero. Um `positive()` aqui impediria de registrar a verdade.
 */
const anchorCentsSchema = z.coerce
  .number()
  .int('Valor inválido')
  .min(-9_999_999_999, 'Valor abaixo do limite')
  .max(9_999_999_999, 'Valor acima do limite')

export const updateBalanceAnchorSchema = z.object({
  openingBalanceCents: anchorCentsSchema,
  openingBalanceOn: z
    .string()
    .trim()
    .refine(isISODate, 'Data inválida'),
  /** O sinal vem de um botão separado: o campo de valor só digita dígitos. */
  isNegative: z
    .union([z.literal('on'), z.literal('true'), z.literal('false'), z.undefined(), z.null()])
    .transform((value) => value === 'on' || value === 'true'),
})

/**
 * O período da Análise que vira o padrão da pessoa. v1.0 — 2026-09-27.
 *
 * Um atalho, ou `custom` com as duas datas. Espelha o `check` da migration 0018: o que o banco
 * recusaria, a tela recusa antes, com mensagem em português.
 */
const isoDate = z.string().trim().refine(isISODate, 'Data inválida')

export const saveAnalysisPeriodSchema = z.discriminatedUnion('period', [
  z.object({ period: z.enum(ANALYSIS_PERIODS) }),
  z
    .object({ period: z.literal('custom'), from: isoDate, to: isoDate })
    .refine((v) => v.from <= v.to, 'Período invertido'),
])
