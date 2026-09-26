import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AiJobKind, AiJobRow, AiJobStatus, Database } from '@/lib/db/types'
import { createClient } from '@/lib/supabase/server'
import { buildContext, SYSTEM_INSTRUCTION } from './context'
import { geminiModelChain } from './env'
import {
  cancelInteraction,
  getInteraction,
  GeminiError,

  startInteraction,
  type Interaction,
} from './gemini'
import {
  buildInsightsInput,
  INSIGHTS_RESPONSE_SCHEMA,
  INSIGHTS_SYSTEM_INSTRUCTION,
  parseInsights,
} from './insights'
import { DEADLINE_MS, nextModel, resolveStartModel, shouldFallback } from './models'
import {
  describeOperation,
  EMPTY_LABELS,
  isDestructive,
  parseFunctionCalls,
  type LabelIndex,
  type Operation,
} from './proposal'
import { notifyJobFinished } from './push'
import { TOOLS } from './tools'

/**
 * Ciclo de vida de um trabalho da IA. v1.0 — 2026-09-26.
 *
 * O trabalho é uma LINHA no banco, não uma promessa em memória. É isso que faz
 * a frase continuar sendo processada com o app fechado: quem executa é o Gemini,
 * numa interação em background, e a linha guarda o ponteiro para ela. Fechar a
 * aba não cancela nada; ao voltar, o resultado está lá.
 *
 * Três caminhos chegam a `advanceJob`, e os três são o mesmo código:
 *
 *  1. o cliente, enquanto a folha está aberta (poll);
 *  2. `after()`, no mesmo request, depois de a resposta já ter saído;
 *  3. a varredura do cron, quando ninguém está olhando.
 *
 * Tudo aqui usa o cliente normal do Supabase, com a RLS valendo. A varredura é
 * a única exceção e tem o próprio cliente, em `lib/supabase/sweeper.ts`.
 */

type Client = SupabaseClient<Database>

/** O que a tela precisa exibir de uma operação proposta. */
export interface ProposalItem {
  description: string
  destructive: boolean
}

/** O resultado de um trabalho de interpretação. */
export interface InterpretResult {
  operations: Operation[]
  items: ProposalItem[]
  /** O que o modelo respondeu em texto quando não chamou ferramenta nenhuma. */
  message: string | null
  rejected: { name: string; reason: string }[]
}

export interface JobView {
  id: string
  kind: AiJobKind
  status: AiJobStatus
  model: string | null
  createdAt: string
  finishedAt: string | null
  error: string | null
  input: { text?: string } | null
  result: unknown
}

function toView(row: AiJobRow): JobView {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    model: row.model,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
    error: row.error,
    // Só o texto vai para a tela: o prompt inteiro é grande e não diz nada a
    // quem está lendo o histórico.
    input: { text: (row.input as { text?: string } | null)?.text ?? '' },
    result: row.result,
  }
}

/** O prazo deste tipo de trabalho, para decidir a queda para o próximo modelo. */
function deadlineFor(kind: AiJobKind): number {
  return kind === 'insights' ? DEADLINE_MS.insights : DEADLINE_MS.interpret
}

// ---------------------------------------------------------------------------
// Criação
// ---------------------------------------------------------------------------

/**
 * O pedido inteiro, guardado na própria linha do trabalho.
 *
 * Isto é o que torna o trabalho **autossuficiente**, e não é detalhe: a
 * varredura do cron roda sem sessão nenhuma, então ela não tem como remontar o
 * contexto financeiro — toda query passa pela RLS, e sem `auth.uid()` voltaria
 * vazia. Com o pedido gravado, trocar de modelo é reenviar exatamente o mesmo
 * texto, o que além de possível é mais correto: repetir a pergunta original,
 * não uma pergunta nova montada meia hora depois.
 *
 * Os rótulos viajam junto pelo mesmo motivo — descrever "apagar o lançamento
 * Padaria" exige saber o nome por trás do id, e quem termina o trabalho pode
 * ser a varredura.
 *
 * Não confunde com o invariante 6: isto não é cópia de dado de domínio, é o
 * registro do que foi perguntado. O lançamento continua morando só em `entries`.
 */
interface JobRequest {
  text: string
  prompt: string
  systemInstruction: string
  labels: LabelIndex
  validCategoryIds: string[]
  useTools: boolean
  responseSchema?: Record<string, unknown>
}

/** Monta o pedido. Só acontece no enfileiramento, na sessão de quem pediu. */
async function buildRequest(kind: AiJobKind, text: string): Promise<JobRequest> {
  if (kind === 'insights') {
    return {
      text,
      prompt: await buildInsightsInput(),
      systemInstruction: INSIGHTS_SYSTEM_INSTRUCTION,
      labels: EMPTY_LABELS,
      validCategoryIds: [],
      useTools: false,
      responseSchema: INSIGHTS_RESPONSE_SCHEMA as unknown as Record<string, unknown>,
    }
  }

  const context = await buildContext()

  return {
    text,
    // O que a pessoa escreveu vai delimitado e rotulado como DADO. A instrução
    // do sistema viaja em `system_instruction`, em outro campo — misturar os
    // dois convidaria uma frase a se passar por regra.
    prompt: `CONTEXTO FINANCEIRO ATUAL:\n${context.text}\n\n---\n\nA PESSOA ESCREVEU:\n"""\n${text}\n"""`,
    systemInstruction: SYSTEM_INSTRUCTION,
    labels: context.labels,
    validCategoryIds: [...context.validCategoryIds],
    useTools: true,
  }
}

/** Lê o pedido de volta da linha. */
function readRequest(row: AiJobRow): JobRequest | null {
  const input = row.input as Partial<JobRequest> | null
  if (!input?.prompt || !input.systemInstruction) return null

  return {
    text: input.text ?? '',
    prompt: input.prompt,
    systemInstruction: input.systemInstruction,
    labels: input.labels ?? EMPTY_LABELS,
    validCategoryIds: input.validCategoryIds ?? [],
    useTools: input.useTools ?? false,
    responseSchema: input.responseSchema,
  }
}

/**
 * Enfileira um trabalho e manda a pergunta ao modelo.
 *
 * Devolve assim que o Gemini confirma a interação — não espera a resposta. Se a
 * criação da interação falhar, o trabalho nasce e morre `failed`, com o motivo
 * gravado: um trabalho que some sem deixar linha é impossível de diagnosticar
 * depois.
 */
export async function enqueueJob(kind: AiJobKind, text: string): Promise<string> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Sessão expirada.')

  const preference = await readModelPreference(supabase)
  const chain = geminiModelChain()
  const model = resolveStartModel(preference, chain)

  const request = await buildRequest(kind, text)

  const { data: created, error } = await supabase
    .from('ai_jobs')
    // A RLS exige `user_id` no `with check`; a policy restringe a linha, ela não
    // preenche o dono.
    .insert({ user_id: user.id, kind, input: request as never })
    .select('id')
    .single()

  if (error || !created) {
    throw new Error(`Não foi possível registrar o pedido: ${error?.message ?? 'sem retorno'}`)
  }

  await startAttempt(supabase, created.id, request, model, 0)

  return created.id
}

/** Começa (ou recomeça, noutro modelo) a interação de um trabalho. */
async function startAttempt(
  supabase: Client,
  jobId: string,
  request: JobRequest,
  model: string,
  attempts: number,
): Promise<void> {
  try {
    const interaction = await startInteraction({
      model,
      input: request.prompt,
      systemInstruction: request.systemInstruction,
      ...(request.useTools ? { tools: TOOLS } : {}),
      ...(request.responseSchema ? { responseSchema: request.responseSchema } : {}),
    })

    await supabase
      .from('ai_jobs')
      .update({
        status: 'running',
        model,
        provider_interaction_id: interaction.id,
        attempts,
        started_at: new Date().toISOString(),
      })
      .eq('id', jobId)
      .select('id')
  } catch (cause) {
    const httpStatus = cause instanceof GeminiError ? cause.httpStatus : undefined
    const proximo = shouldFallback({ httpStatus, elapsedMs: 0, deadlineMs: 1 })
      ? nextModel(geminiModelChain(), model)
      : null

    if (proximo) {
      await startAttempt(supabase, jobId, request, proximo, attempts + 1)
      return
    }

    await failJob(supabase, jobId, cause instanceof Error ? cause.message : 'Falha inesperada')
  }
}

async function readModelPreference(supabase: Client): Promise<string | null> {
  const { data } = await supabase.from('profiles').select('ai_model').maybeSingle()
  return data?.ai_model ?? null
}

// ---------------------------------------------------------------------------
// Avanço
// ---------------------------------------------------------------------------

/**
 * Empurra um trabalho um passo adiante.
 *
 * Lê o estado da interação no provedor e decide: terminou, ainda dá tempo, ou
 * já demorou demais e é hora do próximo modelo da cadeia. Idempotente de
 * propósito — os três chamadores podem rodar ao mesmo tempo sem se atrapalhar,
 * porque terminar um trabalho já terminado é um no-op.
 */
export async function advanceJob(supabase: Client, row: AiJobRow): Promise<AiJobStatus> {
  if (row.status !== 'running' && row.status !== 'queued') return row.status

  const elapsedMs = Date.now() - new Date(row.started_at ?? row.created_at).getTime()
  const deadlineMs = deadlineFor(row.kind)

  // Trabalho sem ponteiro para interação nenhuma: o processo morreu entre criar
  // a linha e chamar o Gemini. Sem este corte ele ficaria 'queued' para sempre,
  // e a varredura o reencontraria a cada minuto, de graça, até o fim dos tempos.
  if (!row.provider_interaction_id) {
    if (elapsedMs < deadlineMs) return row.status
    await failJob(supabase, row.id, 'O pedido não chegou a ser enviado. Tente de novo.')
    return 'failed'
  }

  let interaction: Interaction | null = null
  let httpStatus: number | undefined

  try {
    interaction = await getInteraction(row.provider_interaction_id)
  } catch (cause) {
    httpStatus = cause instanceof GeminiError ? cause.httpStatus : undefined
  }

  const status = interaction?.status

  if (interaction && status === 'completed') {
    return await completeJob(supabase, row, interaction)
  }

  if (shouldFallback({ httpStatus, status, elapsedMs, deadlineMs })) {
    return await fallbackJob(supabase, row)
  }

  // `cancelled` sem ser por nossa conta: alguém cancelou do outro lado.
  if (status === 'cancelled') {
    await failJob(supabase, row.id, 'O modelo cancelou a execução.')
    return 'failed'
  }

  return 'running'
}

/** Troca de modelo e recomeça, ou desiste quando a cadeia acabou. */
async function fallbackJob(supabase: Client, row: AiJobRow): Promise<AiJobStatus> {
  const chain = geminiModelChain()
  const proximo = row.model ? nextModel(chain, row.model) : (chain[0] ?? null)

  // A interação lenta continuaria gastando cota para produzir algo que ninguém
  // vai ler.
  if (row.provider_interaction_id) await cancelInteraction(row.provider_interaction_id)

  if (!proximo) {
    await failJob(
      supabase,
      row.id,
      'Nenhum modelo respondeu a tempo. Tente de novo em alguns instantes.',
    )
    return 'failed'
  }

  const request = readRequest(row)
  if (!request) {
    await failJob(supabase, row.id, 'O pedido original se perdeu. Tente de novo.')
    return 'failed'
  }

  await startAttempt(supabase, row.id, request, proximo, row.attempts + 1)

  return 'running'
}

/** Lê a resposta, traduz para o formato da tela e fecha o trabalho. */
async function completeJob(
  supabase: Client,
  row: AiJobRow,
  interaction: Interaction,
): Promise<AiJobStatus> {
  if (row.kind === 'insights') {
    const insights = parseInsights(interaction.output_text)
    if (!insights) {
      await failJob(supabase, row.id, 'O resumo voltou em formato inesperado.')
      return 'failed'
    }
    await finishJob(supabase, row, insights, 'Seu resumo financeiro está pronto.')
    return 'completed'
  }

  const { operations, rejected } = parseFunctionCalls(interaction.steps ?? [])
  // Rótulos do pedido, e não de um contexto remontado agora: quem chega aqui
  // pode ser a varredura, que não tem sessão para remontar coisa nenhuma.
  const labels = readRequest(row)?.labels ?? EMPTY_LABELS

  const result: InterpretResult = {
    operations,
    items: operations.map((op) => ({
      description: describeOperation(op, labels),
      destructive: isDestructive(op),
    })),
    // Sem nenhuma chamada de ferramenta, o texto do modelo é a resposta: ou ele
    // não entendeu, ou faltou informação. Mostrar isso é melhor que um vazio.
    message: operations.length === 0 ? (interaction.output_text?.trim() ?? null) : null,
    rejected,
  }

  await finishJob(
    supabase,
    row,
    result,
    operations.length > 0
      ? `Entendi ${operations.length} ${operations.length === 1 ? 'operação' : 'operações'}. Confira antes de confirmar.`
      : 'Não consegui entender — veja o que respondi.',
  )

  return 'completed'
}

/**
 * Fecha o trabalho e avisa.
 *
 * O `is('notified_at', null)` não é decoração: a varredura roda de novo a cada
 * minuto e reencontraria o mesmo término, mandando o segundo push. Quem decide
 * se houve notificação é o banco, não uma variável nossa.
 */
async function finishJob(
  supabase: Client,
  row: AiJobRow,
  result: unknown,
  notification: string,
): Promise<void> {
  const { data } = await supabase
    .from('ai_jobs')
    .update({
      status: 'completed',
      result: result as never,
      finished_at: new Date().toISOString(),
      notified_at: new Date().toISOString(),
    })
    .eq('id', row.id)
    .is('notified_at', null)
    .select('id')

  // Sem linha casada, outro caminho já fechou e já avisou.
  if (data && data.length > 0) {
    await notifyJobFinished(supabase, row.user_id, notification)
  }
}

async function failJob(supabase: Client, jobId: string, message: string): Promise<void> {
  await supabase
    .from('ai_jobs')
    .update({ status: 'failed', error: message, finished_at: new Date().toISOString() })
    .eq('id', jobId)
    .select('id')
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

export async function getJobRow(supabase: Client, jobId: string): Promise<AiJobRow | null> {
  const { data, error } = await supabase.from('ai_jobs').select('*').eq('id', jobId).maybeSingle()
  if (error) throw new Error(`Falha ao ler o trabalho: ${error.message}`)
  return data
}

export async function getJob(jobId: string): Promise<JobView | null> {
  const supabase = await createClient()
  const row = await getJobRow(supabase, jobId)
  return row ? toView(row) : null
}

/** Os trabalhos recentes, para o histórico da tela do assistente. */
export async function listRecentJobs(limit = 20): Promise<JobView[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('ai_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`Falha ao listar os pedidos: ${error.message}`)

  return (data ?? []).map(toView)
}

/**
 * Acompanha um trabalho até terminar, ou até o tempo acabar.
 *
 * Usado dentro de `after()`: roda depois de a resposta já ter saído, no mesmo
 * request, e por isso continua mesmo que a pessoa feche o app. O limite existe
 * porque a função na Vercel tem duração máxima — quando ele estoura, a varredura
 * do cron assume.
 */
export async function trackJob(jobId: string, budgetMs = 30_000): Promise<void> {
  const supabase = await createClient()
  const until = Date.now() + budgetMs

  while (Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, 1_500))

    const row = await getJobRow(supabase, jobId)
    if (!row) return

    const status = await advanceJob(supabase, row)
    if (status !== 'running' && status !== 'queued') return
  }
}
