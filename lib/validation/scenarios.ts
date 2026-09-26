import { z } from 'zod'
import { isISODate } from '@/lib/finance/date'

/**
 * Validação de cenário e de seus ajustes.
 *
 * O valor de um override aceita **só positivo**, como `amount_cents_override`
 * no banco: um override troca o valor de uma ocorrência, e ocorrência com valor
 * negativo não existe — o sinal vem do `kind`. Para tirar algo da conta existe
 * `isIncluded: false`, que é a operação certa.
 */

const isoDate = z.string().trim().refine(isISODate, 'Data inválida')

const optionalIsoDate = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .refine((value) => value === null || isISODate(value), 'Data inválida')

export const createScenarioSchema = z
  .object({
    name: z.string().trim().min(1, 'Dê um nome ao cenário').max(60, 'Nome longo demais'),
    startsOn: isoDate,
    endsOn: isoDate,
  })
  .refine((data) => data.endsOn >= data.startsOn, {
    message: 'O fim não pode ser antes do início',
    path: ['endsOn'],
  })

export const renameScenarioSchema = z.object({
  id: z.string().uuid('Cenário inválido'),
  name: z.string().trim().min(1, 'Dê um nome ao cenário').max(60, 'Nome longo demais'),
})

export const scenarioIdSchema = z.object({
  id: z.string().uuid('Cenário inválido'),
})

export const setOverrideSchema = z.object({
  scenarioId: z.string().uuid('Cenário inválido'),
  targetType: z.enum(['entry', 'recurring_rule', 'installment_plan', 'goal']),
  targetId: z.string().uuid('Alvo inválido'),
  // `''` vira null: o override passa a valer para todas as ocorrências do alvo.
  occurrenceKey: z
    .string()
    .trim()
    .max(20, 'Chave inválida')
    .transform((value) => (value === '' ? null : value)),
  isIncluded: z.union([z.literal('true'), z.literal('false')]).transform((v) => v === 'true'),
  amountCents: z
    .string()
    .trim()
    .transform((value) => (value === '' || value === '0' ? null : Number(value)))
    .refine(
      (value) => value === null || (Number.isInteger(value) && value > 0 && value <= 9_999_999_999),
      'Valor inválido',
    ),
  dateOverride: optionalIsoDate,
})

export const removeOverrideSchema = z.object({
  scenarioId: z.string().uuid('Cenário inválido'),
  targetType: z.enum(['entry', 'recurring_rule', 'installment_plan', 'goal']),
  targetId: z.string().uuid('Alvo inválido'),
  occurrenceKey: z
    .string()
    .trim()
    .transform((value) => (value === '' ? null : value)),
})

export const createScenarioEntrySchema = z.object({
  scenarioId: z.string().uuid('Cenário inválido'),
  kind: z.enum(['expense', 'income']),
  description: z.string().trim().min(1, 'Informe a descrição').max(120, 'Descrição longa demais'),
  amountCents: z.coerce
    .number()
    .int('Valor inválido')
    .positive('Informe um valor maior que zero')
    .max(9_999_999_999, 'Valor acima do limite'),
  occursOn: isoDate,
})

export const scenarioEntryIdSchema = z.object({
  id: z.string().uuid('Item inválido'),
})
