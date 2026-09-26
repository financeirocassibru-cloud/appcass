'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { z } from 'zod'
import { applyProposal } from '@/lib/ai/apply'
import { buildContext } from '@/lib/ai/context'
import { isAiConfigured } from '@/lib/ai/env'
import { advanceJob, enqueueJob, getJob, getJobRow, trackJob, type JobView } from '@/lib/ai/jobs'
import { operationSchema } from '@/lib/ai/proposal'
import { createClient } from '@/lib/supabase/server'
import { jobIdSchema, submitMessageSchema } from '@/lib/validation/assistant'

/**
 * O assistente, do lado do servidor. v1.0 — 2026-09-26.
 *
 * O fluxo tem dois tempos, de propósito:
 *
 *   1. `submitMessage` manda a frase ao modelo e devolve na hora um `jobId`. A
 *      interação roda em background no Gemini, então fechar o app no meio não
 *      perde o trabalho.
 *   2. `confirmProposal` executa — e só depois de a pessoa ter lido, em
 *      português, o que a IA entendeu. É o "só pedir confirmação antes para ver
 *      se entendeu direito" do pedido.
 *
 * Entre os dois, nada foi escrito em tabela nenhuma do domínio.
 */

export interface AssistantActionState {
  error?: string
  success?: string
  /** O trabalho recém-criado, para a folha começar a acompanhar. */
  jobId?: string
}

/**
 * Rotas que qualquer coisa executada pelo assistente pode ter mudado.
 *
 * A lista é ampla porque a IA alcança o app inteiro: uma frase pode criar um
 * lançamento, pagar uma conta fixa e aportar numa meta de uma vez só. Revalidar
 * de menos deixaria a tela mentindo logo depois de confirmar — que é o bug de
 * "não atualiza depois de salvar" do app antigo.
 */
function revalidateEverything(): void {
  for (const path of [
    '/',
    '/lancamentos',
    '/compromissos',
    '/parcelas',
    '/metas',
    '/projecao',
    '/cenarios',
    '/assistente',
    '/ajustes/categorias',
    '/ajustes/saldo',
  ]) {
    revalidatePath(path)
  }
}

/**
 * Manda a frase para a IA.
 *
 * O `after()` é o que faz o trabalho continuar com o app fechado sem depender
 * do cron: ele roda **depois** de a resposta já ter saído, no mesmo request do
 * servidor, e por isso não é interrompido quando o navegador fecha. Quando o
 * orçamento dele acaba, a varredura assume.
 */
export async function submitMessage(
  _prev: AssistantActionState,
  formData: FormData,
): Promise<AssistantActionState> {
  if (!isAiConfigured()) {
    return { error: 'O assistente não está configurado. Falta a chave da API do Gemini.' }
  }

  const parsed = submitMessageSchema.safeParse({ text: formData.get('text') })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  let jobId: string
  try {
    jobId = await enqueueJob('interpret', parsed.data.text)
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : 'Não foi possível falar com a IA.' }
  }

  after(async () => {
    await trackJob(jobId)
  })

  revalidatePath('/assistente')

  return { success: 'Estou lendo o que você escreveu.', jobId }
}

/** Pede o resumo e as dicas. Só acontece quando a pessoa toca no botão. */
export async function requestInsights(
  _prev: AssistantActionState,
  _formData: FormData,
): Promise<AssistantActionState> {
  if (!isAiConfigured()) {
    return { error: 'O assistente não está configurado. Falta a chave da API do Gemini.' }
  }

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('ai_insights_enabled')
    .maybeSingle()

  if (!profile?.ai_insights_enabled) {
    return { error: 'O resumo está desligado. Ligue em Ajustes › IA.' }
  }

  let jobId: string
  try {
    jobId = await enqueueJob('insights', '')
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : 'Não foi possível falar com a IA.' }
  }

  after(async () => {
    // Abaixo do `maxDuration` de 60s: pedir o limite inteiro faria a plataforma
    // cortar o acompanhamento em vez de ele terminar por conta própria.
    await trackJob(jobId, 50_000)
  })

  return { success: 'Estou montando seu resumo.', jobId }
}

/**
 * O estado atual de um trabalho.
 *
 * Empurra o trabalho um passo antes de responder: enquanto a folha está aberta,
 * é este poll que faz o resultado chegar, sem depender do cron nem esperar o
 * `after()` terminar.
 */
export async function pollJob(jobId: string): Promise<JobView | null> {
  const parsed = jobIdSchema.safeParse({ jobId })
  if (!parsed.success) return null

  const supabase = await createClient()
  const row = await getJobRow(supabase, parsed.data.jobId)
  if (!row) return null

  if (row.status === 'queued' || row.status === 'running') {
    await advanceJob(supabase, row)
  }

  return await getJob(parsed.data.jobId)
}

/**
 * Executa a proposta confirmada.
 *
 * A proposta é relida do banco pelo `jobId` e revalidada inteira — não vem do
 * corpo do formulário. Isso mantém verdadeira a frase "foi isto que a IA
 * propôs", e o que se executa é o que a tela mostrou.
 *
 * A autorização continua sendo da RLS: cada operação passa pela Server Action
 * correspondente, com o cliente normal. Um id que não é da pessoa não casa
 * linha nenhuma e volta como "não encontrado" (invariante 3).
 */
export async function confirmProposal(
  _prev: AssistantActionState,
  formData: FormData,
): Promise<AssistantActionState> {
  const parsed = jobIdSchema.safeParse({ jobId: formData.get('jobId') })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  const supabase = await createClient()
  const job = await getJobRow(supabase, parsed.data.jobId)

  if (!job) return { error: 'Pedido não encontrado.' }
  if (job.status !== 'completed') return { error: 'Este pedido ainda não terminou.' }

  const operations = z
    .array(operationSchema)
    .safeParse((job.result as { operations?: unknown } | null)?.operations ?? [])

  if (!operations.success || operations.data.length === 0) {
    return { error: 'Não há nada para confirmar neste pedido.' }
  }

  // Marca o pedido como consumido ANTES de executar, e só segue se esta chamada
  // foi quem o marcou.
  //
  // Sem isto, dois toques no botão — ou um "voltar" e confirmar de novo —
  // criariam o lançamento duas vezes. É a mesma classe de bug que o índice
  // `entries_generated_uniq` impede para custo fixo; aqui a proteção é a
  // transição de estado, porque `createInstallmentPlan` não é idempotente e
  // repeti-lo criaria um segundo plano para a mesma compra.
  // O `confirmedAt` viaja na MESMA escrita, e não numa segunda: é ele que faz o
  // histórico distinguir um pedido confirmado de um descartado — os dois saem
  // de 'completed', e sem a marca ambos apareceriam como "descartado".
  const { data: claimed } = await supabase
    .from('ai_jobs')
    .update({
      status: 'canceled',
      result: {
        ...(job.result as Record<string, unknown>),
        confirmedAt: new Date().toISOString(),
      } as never,
    })
    .eq('id', job.id)
    .eq('status', 'completed')
    .select('id')

  if (!claimed || claimed.length === 0) {
    return { error: 'Este pedido já foi confirmado.' }
  }

  // Contexto relido agora, e não o de quando a IA respondeu: entre uma coisa e
  // outra a pessoa pode ter criado uma categoria em outra aba.
  const context = await buildContext()
  const report = await applyProposal(operations.data, context.labels, context.validCategoryIds)

  // Registra o que foi aplicado, para a tela do assistente mostrar depois o que
  // entrou e o que não entrou. Falhar aqui não desfaz nada nem muda a resposta:
  // o que importa já foi escrito pelas actions, e o histórico é acessório.
  await supabase.from('ai_jobs').insert({
    user_id: job.user_id,
    kind: 'apply',
    status: 'completed',
    input: { text: `Confirmação do pedido ${job.id}` },
    result: report as never,
    finished_at: new Date().toISOString(),
  })

  revalidateEverything()

  if (report.failedCount === 0) {
    return {
      success:
        report.okCount === 1 ? 'Pronto, registrei.' : `Pronto, registrei ${report.okCount} itens.`,
    }
  }

  if (report.okCount === 0) {
    return { error: report.applied.find((a) => !a.ok)?.error ?? 'Nada pôde ser registrado.' }
  }

  return {
    success: `Registrei ${report.okCount} de ${report.applied.length}. Veja o que faltou em Assistente.`,
  }
}

/** Descarta um pedido sem executar nada. */
export async function discardJob(
  _prev: AssistantActionState,
  formData: FormData,
): Promise<AssistantActionState> {
  const parsed = jobIdSchema.safeParse({ jobId: formData.get('jobId') })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  const supabase = await createClient()
  const { data } = await supabase
    .from('ai_jobs')
    .update({ status: 'canceled', finished_at: new Date().toISOString() })
    .eq('id', parsed.data.jobId)
    .select('id')

  if (!data || data.length === 0) return { error: 'Pedido não encontrado.' }

  revalidatePath('/assistente')

  return { success: 'Descartado. Nada foi registrado.' }
}
