/**
 * A cadeia de modelos do Gemini e a regra de queda para o próximo. v1.0 — 2026-09-26.
 *
 * Módulo **puro**, no mesmo espírito do invariante 9: sem I/O, sem relógio
 * implícito — o tempo decorrido entra por parâmetro. É aqui que mora a regra
 * "se um demorar para responder, ofereça outro", e é por isso que ela é
 * testável sem chave de API e sem rede.
 *
 * A ordem é a de lançamento, do mais recente para o mais antigo. O primeiro é o
 * padrão de quem nunca escolheu nada; a escolha manual apenas move o ponto de
 * partida, não amarra: a partir dela a queda continua na mesma ordem.
 */

/**
 * Ordem de lançamento, do mais novo para o mais velho.
 *
 * Fica em código e não no banco de propósito: é configuração de aplicação, e a
 * migration não deve precisar rodar de novo quando o Google lançar o próximo.
 * Para trocar sem deploy, use `GEMINI_MODELS`.
 */
export const DEFAULT_MODEL_CHAIN = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
] as const

/** Quanto tempo esperar antes de considerar que o modelo demorou demais. */
export const DEADLINE_MS = {
  /** Interpretar uma frase curta. Passou disso, o próximo da fila é mais rápido. */
  interpret: 20_000,
  /** Resumo e dicas: mais texto para ler e escrever, prazo maior. */
  insights: 45_000,
} as const

export type DeadlineKind = keyof typeof DEADLINE_MS

/**
 * A cadeia configurada.
 *
 * `GEMINI_MODELS` aceita uma lista separada por vírgula e sobrescreve tudo —
 * é a saída para corrigir um id de modelo sem tocar no código. Lista vazia ou
 * só com lixo cai de volta no padrão: ficar sem cadeia nenhuma deixaria o app
 * sem IA por um erro de digitação numa variável de ambiente.
 */
export function parseModelChain(raw: string | undefined): readonly string[] {
  if (!raw) return DEFAULT_MODEL_CHAIN

  const parsed = raw
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name !== '')

  // Duplicata na cadeia faria a queda repetir o modelo que acabou de falhar.
  const unique = [...new Set(parsed)]

  return unique.length > 0 ? unique : DEFAULT_MODEL_CHAIN
}

/**
 * Por qual modelo começar.
 *
 * A preferência só vale se ainda estiver na cadeia: um modelo aposentado que
 * ficou gravado em `profiles.ai_model` não pode travar a IA de quem o escolheu
 * um dia. Nesse caso, volta silenciosamente para o mais recente.
 */
export function resolveStartModel(
  preference: string | null | undefined,
  chain: readonly string[],
): string {
  const first = chain[0]
  if (first === undefined) throw new Error('Cadeia de modelos vazia.')

  if (!preference) return first
  const normalized = preference.trim().toLowerCase()

  return chain.includes(normalized) ? normalized : first
}

/** O próximo da fila, ou `null` quando a cadeia acabou. */
export function nextModel(chain: readonly string[], current: string): string | null {
  const index = chain.indexOf(current)
  // Modelo fora da cadeia (trocaram `GEMINI_MODELS` com job no ar): recomeça do
  // topo em vez de desistir — ainda há modelos válidos para tentar.
  if (index === -1) return chain[0] ?? null

  return chain[index + 1] ?? null
}

export interface FallbackSignal {
  /** Status HTTP da última resposta do provedor, quando houve uma. */
  httpStatus?: number | undefined
  /** Status da interação, como o provedor o reporta. */
  status?: string | undefined
  /** Há quanto tempo este modelo está com a pergunta na mão. */
  elapsedMs: number
  deadlineMs: number
}

/**
 * Status HTTP que significam "tente outro modelo", não "desista".
 *
 * 429 é cota, 404 é modelo que não existe (id errado em `GEMINI_MODELS`), e a
 * faixa 5xx é indisponibilidade do lado deles. Um 400 fica de fora de propósito:
 * é pedido malformado, e repeti-lo em outro modelo só gasta cota para receber o
 * mesmo erro.
 */
export function isRetriableHttpStatus(status: number): boolean {
  return status === 404 || status === 408 || status === 429 || status >= 500
}

/**
 * Chegou a hora de cair para o próximo?
 *
 * Três motivos, nesta ordem: o provedor recusou de um jeito que outro modelo
 * pode aceitar; a interação terminou em falha; ou ela simplesmente demorou mais
 * que o prazo — que é o caso que o pedido descreve como "se um demorar para
 * responder, o sistema já oferece outro".
 */
export function shouldFallback(signal: FallbackSignal): boolean {
  if (signal.httpStatus !== undefined && isRetriableHttpStatus(signal.httpStatus)) {
    return true
  }
  if (signal.status === 'failed') return true

  const emAndamento = signal.status === undefined || signal.status === 'in_progress'

  return emAndamento && signal.elapsedMs >= signal.deadlineMs
}
