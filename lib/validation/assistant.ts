import { z } from 'zod'
import { DEFAULT_MODEL_CHAIN } from '@/lib/ai/models'
import { draftItemSchema, type DraftItem } from '@/lib/ai/triage'

/**
 * Validação das entradas do assistente. v1.1 — 2026-09-26.
 *
 * v1.1: acrescentados `briefingSchema` e `approveBriefingSchema`, do primeiro tempo da
 * conversa. Os dois recebem histórico vindo do cliente, e isso pede uma frase explícita:
 * **o histórico é DADO, não autorização.** Ele é validado, contado e truncado aqui, e
 * nada dentro dele decide coisa nenhuma — quem autoriza escrita continua sendo a tela de
 * confirmação, o `operationSchema` e a RLS, todos depois deste ponto. No pior caso a
 * pessoa engana o próprio assistente sobre o que ela mesma disse.
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

/**
 * Quantas falas do histórico viajam de volta.
 *
 * Teto e não erro: um histórico comprido é motivo para cortar o começo, não para
 * recusar a frase que a pessoa acabou de escrever. Ficam as mais recentes, que são as
 * que importam para entender uma correção.
 */
const MAX_TURNOS = 8

const turnoSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(2_000),
})

export type BriefingTurnInput = z.infer<typeof turnoSchema>

/**
 * Lê o histórico que veio no formulário.
 *
 * Histórico torto vira lista vazia, em silêncio. O alternativa seria recusar a mensagem
 * da pessoa por causa de um campo que ela não digitou — e a conversa funciona sem
 * histórico, só com menos contexto.
 */
function lerTurnos(raw: string | null | undefined): BriefingTurnInput[] {
  if (!raw) return []

  let bruto: unknown
  try {
    bruto = JSON.parse(raw)
  } catch {
    return []
  }

  const lista = z.array(turnoSchema).safeParse(bruto)
  if (!lista.success) return []

  return lista.data.slice(-MAX_TURNOS)
}

/** Lê o rascunho aprovado. Torto vira vazio, e o caminho pesado interpreta do zero. */
function lerRascunho(raw: string | null | undefined): DraftItem[] {
  if (!raw) return []

  let bruto: unknown
  try {
    bruto = JSON.parse(raw)
  } catch {
    return []
  }

  const lista = z.array(draftItemSchema).max(10).safeParse(bruto)

  return lista.success ? lista.data : []
}

const textoDaFrase = z
  .string()
  .trim()
  .min(2, 'Conte o que aconteceu')
  .max(2_000, 'Texto longo demais — conte em partes')

/** O que a pessoa escreveu agora, mais as falas anteriores desta conversa. */
export const briefingSchema = z.object({
  text: textoDaFrase,
  turns: z
    .string()
    .nullish()
    .transform((value) => lerTurnos(value)),
})

/**
 * A aprovação do briefing: daqui em diante é o caminho pesado.
 *
 * `text` aceita mais que uma frase porque pode ser a soma das falas da pessoa depois de
 * uma ou duas correções — é o texto que o segundo tempo vai reinterpretar com o
 * contexto financeiro na mão.
 */
export const approveBriefingSchema = z.object({
  text: z
    .string()
    .trim()
    .min(2, 'Conte o que aconteceu')
    .max(4_000, 'Conversa longa demais — comece de novo com o essencial'),
  draft: z
    .string()
    .nullish()
    .transform((value) => lerRascunho(value)),
  turns: z
    .string()
    .nullish()
    .transform((value) => lerTurnos(value)),
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
export const toggleReasoningSchema = z.object({ enabled: strictBoolean })

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
