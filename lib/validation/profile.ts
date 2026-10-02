import { z } from 'zod'
import { isISODate } from '@/lib/finance/date'
import { ANALYSIS_PERIODS } from '@/lib/finance/periods'

/*
 * Validação do perfil. v1.1 — 02/10/2026.
 *
 * v1.1: `adjustBalanceSchema` (o ajuste que vira lançamento) e `resetBalanceSchema` (o
 * "Zerar", com a frase de confirmação para apagar o histórico).
 */

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

/** O sinal vem de um botão separado: o campo de valor só digita dígitos. */
const isNegativeSchema = z
  .union([z.literal('on'), z.literal('true'), z.literal('false'), z.undefined(), z.null()])
  .transform((value) => value === 'on' || value === 'true')

export const updateBalanceAnchorSchema = z.object({
  openingBalanceCents: anchorCentsSchema,
  openingBalanceOn: z
    .string()
    .trim()
    .refine(isISODate, 'Data inválida'),
  isNegative: isNegativeSchema,
})

/**
 * Ajuste de saldo que vira lançamento. v1.1 — 02/10/2026.
 *
 * `targetCents` é quanto a pessoa diz ter agora; a diferença é calculada no servidor.
 * `expectedKind` é o tipo que a tela mostrou (saída ou entrada): se o saldo mudou entre
 * abrir a tela e salvar e o tipo virou, a categoria escolhida seria do tipo errado — a
 * action recusa em vez de gravar errado. Nome e categoria são opcionais.
 */
export const adjustBalanceSchema = z.object({
  targetCents: anchorCentsSchema,
  isNegative: isNegativeSchema,
  expectedKind: z.enum(['expense', 'income'], { message: 'Tipo do ajuste inválido' }),
  description: z
    .string()
    .trim()
    .max(120, 'Nome longo demais')
    .nullish()
    .transform((value) => (value ? value : null)),
  categoryId: z
    .string()
    .trim()
    .nullish()
    .transform((value) => (value ? value : null))
    .refine((value) => value === null || z.string().uuid().safeParse(value).success, 'Categoria inválida'),
})

/** A frase que libera apagar o histórico. Tela e servidor conferem a mesma. v1.1 — 02/10/2026. */
export const RESET_CONFIRMATION_PHRASE = 'Quero mesmo excluir'

/**
 * "Zerar": nova âncora, sem explicar a diferença. v1.1 — 02/10/2026.
 *
 * Com `wipeHistory`, os lançamentos anteriores à data são apagados — e só passa com a frase
 * digitada exatamente. A conferência repete a da tela porque a tela não é garantia.
 */
export const resetBalanceSchema = updateBalanceAnchorSchema
  .extend({
    wipeHistory: z
      .union([z.literal('true'), z.literal('false'), z.undefined(), z.null()])
      .transform((value) => value === 'true'),
    confirmation: z
      .string()
      .nullish()
      .transform((value) => (value ?? '').trim()),
  })
  .refine(
    (value) => !value.wipeHistory || value.confirmation === RESET_CONFIRMATION_PHRASE,
    `Para apagar o histórico, digite "${RESET_CONFIRMATION_PHRASE}".`,
  )

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
