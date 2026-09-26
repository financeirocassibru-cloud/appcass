import 'server-only'

import { z } from 'zod'
import { geminiApiKey } from './env'
import type { ToolDeclaration } from './tools'

/**
 * Cliente da Interactions API do Gemini. v1.0 — 2026-09-26.
 *
 * Três decisões que valem explicação:
 *
 * 1. **`fetch` direto, sem SDK.** O que este app usa da API cabe em três
 *    chamadas — criar, ler, cancelar. Um SDK traria uma dependência a mais para
 *    empacotar o mesmo POST, e mais uma superfície para versionar.
 *
 * 2. **`background: true` em toda interação.** É o que faz o trabalho continuar
 *    com o app fechado: quem segura a execução é o Google, e o que guardamos é
 *    o `id` dela. Sem isso, fechar a aba no meio de uma frase perderia o
 *    trabalho — e o pedido desta fase é exatamente o contrário.
 *
 * 3. **`Api-Revision` fixa.** A API está em beta; sem fixar a revisão, uma
 *    mudança no formato da resposta chegaria sozinha, em produção, num domingo.
 *
 * O `fetch` entra por parâmetro para o teste poder injetar o dele — é o que
 * permite testar a queda para o próximo modelo sem chave e sem rede.
 */

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions'
const API_REVISION = '2026-05-20'

/** Quanto esperar por UMA resposta HTTP. Não é o prazo do trabalho — esse é `DEADLINE_MS`. */
const HTTP_TIMEOUT_MS = 15_000

export type FetchLike = typeof globalThis.fetch

/**
 * A interação, como a API a devolve.
 *
 * `passthrough` de propósito: a API acrescenta campos, e recusar a resposta
 * inteira porque apareceu um campo novo seria quebrar sozinho.
 */
const interactionSchema = z
  .object({
    id: z.string(),
    status: z.string().optional(),
    steps: z.array(z.unknown()).optional(),
    output_text: z.string().optional(),
  })
  .passthrough()

export type Interaction = z.infer<typeof interactionSchema>

/** Erro de transporte ou de recusa do provedor, com o status para decidir a queda. */
export class GeminiError extends Error {
  readonly httpStatus: number | undefined

  constructor(message: string, httpStatus?: number) {
    super(message)
    this.name = 'GeminiError'
    this.httpStatus = httpStatus
  }
}

export interface StartInteractionInput {
  model: string
  /** O texto da pessoa, mais o retrato do contexto financeiro dela. */
  input: string
  systemInstruction?: string
  tools?: readonly ToolDeclaration[]
  /** Esquema JSON da resposta, para o resumo voltar em formato fixo. */
  responseSchema?: Record<string, unknown>
}

async function request(
  url: string,
  init: RequestInit,
  doFetch: FetchLike,
): Promise<Interaction> {
  // A chave é lida ANTES do try, e isso não é estilo: dentro dele, o erro de
  // "variável de ambiente ausente" seria capturado e devolvido como falha de
  // rede — e aí a cadeia de modelos gastaria as cinco tentativas para descobrir
  // que o problema nunca esteve no modelo.
  const apiKey = geminiApiKey()

  // AbortController e não só o timeout do runtime: sem isto, uma conexão pendurada
  // prenderia a Server Action até o limite da função na Vercel.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS)

  let response: Response
  try {
    response = await doFetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Api-Revision': API_REVISION,
        'x-goog-api-key': apiKey,
        ...init.headers,
      },
    })
  } catch (cause) {
    // Abortar por tempo é tratado como 408: `shouldFallback` já entende esse
    // status como "tente o próximo modelo".
    const abortou = cause instanceof Error && cause.name === 'AbortError'
    throw new GeminiError(
      abortou ? 'O modelo não respondeu a tempo.' : 'Falha ao falar com o Gemini.',
      abortou ? 408 : undefined,
    )
  } finally {
    clearTimeout(timer)
  }

  if (!response.ok) {
    // O corpo do erro costuma trazer a razão; se não der para ler, o status já
    // diz o suficiente para decidir entre cair para o próximo e desistir.
    const detalhe = await response.text().catch(() => '')
    throw new GeminiError(
      `Gemini respondeu ${response.status}${detalhe ? `: ${detalhe.slice(0, 300)}` : ''}`,
      response.status,
    )
  }

  const body: unknown = await response.json().catch(() => null)
  const parsed = interactionSchema.safeParse(body)
  if (!parsed.success) {
    throw new GeminiError('Resposta do Gemini em formato inesperado.')
  }

  return parsed.data
}

/**
 * Começa uma interação em segundo plano.
 *
 * Devolve na hora, com o `id` e o status inicial. O resultado vem depois, por
 * `getInteraction` — de dentro do mesmo request (via `after()`), do poll do
 * cliente, ou da varredura do cron quando o app já fechou.
 */
export async function startInteraction(
  input: StartInteractionInput,
  doFetch: FetchLike = globalThis.fetch,
): Promise<Interaction> {
  const body: Record<string, unknown> = {
    model: input.model,
    input: input.input,
    background: true,
  }

  if (input.systemInstruction) body.system_instruction = input.systemInstruction
  if (input.tools && input.tools.length > 0) {
    body.tools = input.tools
    // O modelo pode responder em texto ("não entendi") em vez de chamar uma
    // ferramenta, e isso é uma resposta legítima: forçar a chamada produziria
    // um lançamento inventado a partir de uma frase ambígua.
    body.tool_choice = 'auto'
  }
  if (input.responseSchema) {
    body.response_format = {
      type: 'text',
      mime_type: 'application/json',
      schema: input.responseSchema,
    }
  }

  return await request(ENDPOINT, { method: 'POST', body: JSON.stringify(body) }, doFetch)
}

/** Lê o estado atual de uma interação. */
export async function getInteraction(
  interactionId: string,
  doFetch: FetchLike = globalThis.fetch,
): Promise<Interaction> {
  return await request(
    `${ENDPOINT}/${encodeURIComponent(interactionId)}`,
    { method: 'GET' },
    doFetch,
  )
}

/**
 * Cancela uma interação.
 *
 * Usado ao cair para o próximo modelo: sem cancelar, a interação lenta
 * continuaria consumindo cota para produzir uma resposta que ninguém mais vai
 * ler. Falha aqui não é motivo para abortar a queda — por isso não propaga.
 */
export async function cancelInteraction(
  interactionId: string,
  doFetch: FetchLike = globalThis.fetch,
): Promise<void> {
  try {
    await request(
      `${ENDPOINT}/${encodeURIComponent(interactionId)}/cancel`,
      { method: 'POST' },
      doFetch,
    )
  } catch {
    // Silencioso de propósito: já estamos no caminho de recuperação.
  }
}

/** Status terminais, como a API os nomeia. */
export function isTerminal(status: string | undefined): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}
