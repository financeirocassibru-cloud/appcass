import { z } from 'zod'
import { isISODate } from '@/lib/finance/date'
import { isMonthKey } from '@/lib/finance/habits'

/**
 * Validação de cenário e de seus ajustes.
 *
 * O valor de um override aceita **só positivo**, como `amount_cents_override`
 * no banco: um override troca o valor de uma ocorrência, e ocorrência com valor
 * negativo não existe — o sinal vem do `kind`. Para tirar algo da conta existe
 * `isIncluded: false`, que é a operação certa.
 *
 * v1.1 — 2026-09-27: "Duplicar hábitos" (`habitsSchema`), edição de item hipotético
 * (`updateScenarioEntrySchema`) e categoria opcional no item hipotético.
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

/** `''` vira `null`: sem categoria escolhida. */
const optionalCategory = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .refine((value) => value === null || z.string().uuid().safeParse(value).success, 'Categoria inválida')

/** Os campos de um item hipotético — os mesmos ao criar e ao editar. */
const scenarioEntryFields = {
  kind: z.enum(['expense', 'income']),
  description: z.string().trim().min(1, 'Informe a descrição').max(120, 'Descrição longa demais'),
  amountCents: z.coerce
    .number()
    .int('Valor inválido')
    .positive('Informe um valor maior que zero')
    .max(9_999_999_999, 'Valor acima do limite'),
  occursOn: isoDate,
  // v1.1 — 2026-09-27: o item duplicado de um hábito traz a categoria do original.
  categoryId: optionalCategory,
}

export const createScenarioEntrySchema = z.object({
  scenarioId: z.string().uuid('Cenário inválido'),
  ...scenarioEntryFields,
})

/** v1.1 — 2026-09-27: um item hipotético (inclusive duplicado) se edita como um manual. */
export const updateScenarioEntrySchema = z.object({
  id: z.string().uuid('Item inválido'),
  ...scenarioEntryFields,
})

const monthKeySchema = z.string().trim().refine(isMonthKey, 'Mês inválido')

/**
 * "Duplicar hábitos". v1.0 — 2026-09-27.
 *
 * Dois schemas: a prévia (`habitsPreviewSchema`) só precisa de onde vem e para onde vai; a
 * aplicação (`habitsSchema`) exige também `kinds`, sem valor padrão de propósito — a tela
 * precisa perguntar se é tudo, só saídas ou só entradas, e um padrão silencioso pularia a
 * pergunta.
 */
const habitsBase = {
  sourceMonth: monthKeySchema,
  target: z.enum(['all', 'range']),
  rangeFrom: z.string().trim(),
  rangeTo: z.string().trim(),
}

function toRange(data: { target: 'all' | 'range'; rangeFrom: string; rangeTo: string }) {
  return data.target === 'range' ? { from: data.rangeFrom, to: data.rangeTo } : null
}

function validRange(range: { from: string; to: string } | null): boolean {
  return range === null || (isMonthKey(range.from) && isMonthKey(range.to) && range.from <= range.to)
}

const rangeIssue = { message: 'Intervalo de meses inválido', path: ['rangeTo'] }

export const habitsPreviewSchema = z
  .object(habitsBase)
  .transform((data) => ({ sourceMonth: data.sourceMonth, range: toRange(data) }))
  .refine((data) => validRange(data.range), rangeIssue)

export const habitsSchema = z
  .object({
    ...habitsBase,
    kinds: z.enum(['all', 'expense', 'income'], { message: 'Escolha o que duplicar' }),
  })
  .transform((data) => ({ sourceMonth: data.sourceMonth, kinds: data.kinds, range: toRange(data) }))
  .refine((data) => validRange(data.range), rangeIssue)

export const scenarioEntryIdSchema = z.object({
  id: z.string().uuid('Item inválido'),
})
