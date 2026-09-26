import 'server-only'

import { z } from 'zod'
import { geminiApiKey } from './env'
import type { ToolDeclaration } from './tools'

/**
 * Cliente da Interactions API do Gemini. v1.2 — 2026-09-26.
 *
 * v1.2: `isTerminal` saiu daqui e passou a ser reexportada de `models.ts`. Ela
 * definia os status finais neste arquivo, mas a única regra que precisava saber
 * disso — `shouldFallback` — vive no módulo puro e não pode importar de um
 * `server-only`. Resultado: a regra tinha a própria lista, incompleta, e um status
 * não-final que ela não conhecia travava o trabalho para sempre. Agora a lista é uma.
 *
 * v1.1: removido o `tool_choice` da raiz do corpo, que fazia a API recusar toda
 * requisição com 400 `Unknown parameter`. O campo existe, mas dentro de
 * `generation_config` — e `auto`, que era o valor mandado, já é o padrão. Ver o
 * comentário em `startInteraction`. Junto, as mensagens de erro passaram a
 * distinguir o que a pessoa resolve do que ela não resolve.
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
    throw new GeminiError(mensagemDeErro(response.status, detalhe), response.status)
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
    // **Nada de `tool_choice` aqui.** A primeira versão mandava
    // `tool_choice: 'auto'` no topo do corpo, e a API recusou a requisição
    // inteira com 400 `Unknown parameter 'tool_choice'` — o campo existe, mas
    // dentro de `generation_config`, não na raiz.
    //
    // A correção não é mudá-lo de lugar: é não mandá-lo. `auto` já é o padrão
    // quando o campo é omitido, e `auto` é exatamente o que este app quer — o
    // modelo pode responder em texto ("não entendi qual lançamento") em vez de
    // chamar uma ferramenta, e isso é resposta legítima. Forçar a chamada com
    // `any` produziria um lançamento inventado a partir de uma frase ambígua.
    //
    // Ou seja: o campo que quebrou a IA em produção pedia de forma explícita,
    // e arriscada, o comportamento que já vinha de graça. Cada parâmetro
    // mandado é uma chance de o provedor recusar o corpo todo; o que não muda
    // nada em relação ao padrão não vai.
  }
  if (input.responseSchema) {
    // **`type: 'text'` fica como está, e isso é deliberado.**
    //
    // Este corpo é aceito: o resumo que voltou "em formato inesperado" voltou com
    // 200, não com 400 — o que falhou foi a leitura, não o pedido. Trocar o `type`
    // por um valor mais expressivo (`json_object`, `json_schema`) é tentador e está
    // errado pelo mesmo motivo do `tool_choice` logo acima: um valor que a API não
    // reconheça derruba o corpo INTEIRO com 400, e `isRetriableHttpStatus(400)` é
    // `false`, então o resumo pararia de funcionar sempre em vez de às vezes.
    //
    // O que garante o JSON é o contrato escrito na instrução do sistema
    // (`INSIGHTS_SYSTEM_INSTRUCTION`) mais a leitura tolerante de `parseLooseJson`.
    // Os dois funcionam sem depender de o provedor honrar campo nenhum — e o schema
    // segue indo, porque ajuda quando é honrado e não custa nada quando não é.
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

/**
 * A mensagem que a pessoa vai ler quando o provedor recusa.
 *
 * Distingue o que ela pode resolver do que não pode, porque a diferença muda o
 * que ela faz em seguida. Um 400 é contrato: o corpo que mandamos não é o que a
 * API espera, tentar de novo não muda nada, e não é culpa de quem escreveu a
 * frase. Foi o caso real de `tool_choice` — a tela mostrava JSON cru em inglês
 * num app em português, e parecia que a pessoa tinha digitado algo errado.
 *
 * O detalhe técnico continua na mensagem, no fim: é o que permite diagnosticar,
 * e esconder isso trocaria um erro feio por um erro mudo.
 */
function mensagemDeErro(status: number, detalhe: string): string {
  const tecnico = detalhe ? ` (${detalhe.slice(0, 300)})` : ''

  if (status === 400) {
    return `O pedido enviado à IA não bate com o que a API espera — isso é um problema do app, não do que você escreveu, e tentar de novo não resolve.${tecnico}`
  }
  if (status === 401 || status === 403) {
    return `A chave da API do Gemini foi recusada. Confira GEMINI_API_KEY nas variáveis de ambiente.${tecnico}`
  }
  if (status === 429) {
    return `A cota da API do Gemini estourou. Tente de novo em alguns minutos.${tecnico}`
  }
  if (status === 404) {
    return `O modelo pedido não existe. Confira GEMINI_MODELS, ou o modelo escolhido em Ajustes › IA.${tecnico}`
  }
  if (status >= 500) {
    return `O Gemini está indisponível agora. Tente de novo em alguns instantes.${tecnico}`
  }

  return `A IA respondeu com um erro (${status}).${tecnico}`
}

/**
 * Status terminais, como a API os nomeia.
 *
 * A definição mora em `models.ts` — módulo puro, que é onde `shouldFallback` a
 * consulta. Aqui fica só a reexportação, para quem pensa neste arquivo como o dono
 * do vocabulário da API continuar achando o que procura.
 */
export { isTerminal, TERMINAL_STATUSES } from './models'
