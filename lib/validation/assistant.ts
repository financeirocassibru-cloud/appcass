import { z } from 'zod'
import { DEFAULT_MODEL_CHAIN } from '@/lib/ai/models'

/**
 * Validação das entradas do assistente. v1.0 — 2026-09-26.
 *
 * O que chega aqui vem de um formulário, como em qualquer outra tela. A
 * proposta em si NÃO é revalidada neste arquivo: ela é relida do banco pelo
 * `jobId` e passa de novo pelo `operationSchema` em `lib/ai/proposal.ts`. Assim
 * o que se executa é o que o modelo propôs e a pessoa confirmou, e não um corpo
 * de requisição montado à mão.
 */

/** O teto existe para uma frase colada por engano não virar um prompt gigante. */
export const submitMessageSchema = z.object({
  text: z
    .string()
    .trim()
    .min(2, 'Conte o que aconteceu')
    .max(2_000, 'Texto longo demais — conte em partes'),
})

export const jobIdSchema = z.object({
  jobId: z.string().uuid('Pedido inválido'),
})

/** Booleano estrito: ausente não é `false`, é erro — o mesmo padrão das demais telas. */
const strictBoolean = z
  .union([z.literal('true'), z.literal('false')])
  .transform((value) => value === 'true')

export const toggleInsightsSchema = z.object({ enabled: strictBoolean })
export const toggleNotificationsSchema = z.object({ enabled: strictBoolean })

/**
 * O modelo escolhido à mão.
 *
 * `''` volta para o padrão (o mais recente da cadeia). A validação é contra
 * `DEFAULT_MODEL_CHAIN` e não contra a cadeia configurada por `GEMINI_MODELS`:
 * o `<select>` da tela oferece exatamente esta lista, e aceitar texto livre aqui
 * deixaria um nome inventado virar parte de uma URL montada com ele.
 */
export const setModelSchema = z.object({
  model: z
    .string()
    .trim()
    .transform((value) => (value === '' ? null : value.toLowerCase()))
    .refine(
      (value) => value === null || (DEFAULT_MODEL_CHAIN as readonly string[]).includes(value),
      'Modelo desconhecido',
    ),
})

/** A inscrição que o navegador devolve em `pushManager.subscribe()`. */
export const pushSubscriptionSchema = z.object({
  endpoint: z.string().trim().url('Inscrição inválida').max(1_000),
  p256dh: z.string().trim().min(1, 'Inscrição inválida').max(500),
  auth: z.string().trim().min(1, 'Inscrição inválida').max(500),
  userAgent: z
    .string()
    .trim()
    .max(300)
    .transform((value) => (value === '' ? null : value)),
})
