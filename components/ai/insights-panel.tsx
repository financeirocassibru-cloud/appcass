'use client'

import { useActionState, useEffect, useState } from 'react'
import { pollJob, requestInsights, type AssistantActionState } from '@/lib/actions/assistant'
import type { JobView } from '@/lib/ai/jobs'
import { FormMessage } from '@/components/auth/form-field'
import { Button } from '@/components/ui/button'

/**
 * Resumo da situação financeira e dicas. v1.0 — 2026-09-26.
 *
 * **Só sob demanda**, por decisão de produto: nada é gerado ao abrir a tela. O
 * botão é o gatilho, e enquanto ninguém o toca não há chamada nenhuma à API.
 *
 * O componente inteiro só é montado quando `ai_insights_enabled` é verdadeiro —
 * quem decide isso é a página, no servidor. Desligado nos ajustes, o botão não
 * fica cinza: ele não existe.
 */

const POLL_MS = 1_200

interface Insights {
  summary?: string
  tips?: string[]
}

const initialState: AssistantActionState = {}

export function InsightsPanel() {
  const [job, setJob] = useState<JobView | null>(null)

  const [state, formAction, pending] = useActionState(
    async (prev: AssistantActionState, formData: FormData) => {
      const result = await requestInsights(prev, formData)
      if (result.jobId) setJob(null)
      return result
    },
    initialState,
  )

  const jobId = state.jobId

  useEffect(() => {
    if (!jobId) return
    let ativo = true

    const tick = async () => {
      const atual = await pollJob(jobId)
      if (!ativo) return
      setJob(atual)
      if (atual && (atual.status === 'queued' || atual.status === 'running')) {
        timer = setTimeout(() => void tick(), POLL_MS)
      }
    }

    let timer = setTimeout(() => void tick(), POLL_MS)

    return () => {
      ativo = false
      clearTimeout(timer)
    }
  }, [jobId])

  const insights = (job?.result ?? null) as Insights | null
  const trabalhando = Boolean(jobId) && (!job || job.status === 'queued' || job.status === 'running')

  return (
    <section className="flex flex-col gap-3 rounded-xl bg-[var(--surface)] p-5">
      <h2 className="text-base font-semibold">Como estão suas finanças</h2>

      {!insights && !trabalhando && (
        <>
          <p className="text-muted-foreground text-sm">
            Um resumo do seu momento e o que dá para fazer a respeito.
          </p>
          <form action={formAction}>
            <Button type="submit" variant="outline" disabled={pending} className="min-h-11 w-full">
              {pending ? 'Pedindo…' : 'Ver resumo'}
            </Button>
          </form>
        </>
      )}

      {trabalhando && (
        <p role="status" className="text-muted-foreground py-4 text-sm">
          Olhando suas contas…
          <br />
          <span className="text-xs">Pode fechar o app: eu aviso quando terminar.</span>
        </p>
      )}

      <FormMessage error={state.error ?? job?.error ?? undefined} />

      {insights?.summary && (
        <div className="flex flex-col gap-3">
          {insights.summary.split('\n').filter(Boolean).map((paragrafo, i) => (
            <p key={i} className="text-sm leading-relaxed">
              {paragrafo}
            </p>
          ))}

          {insights.tips && insights.tips.length > 0 && (
            <>
              <h3 className="pt-1 text-sm font-semibold">O que dá para fazer</h3>
              <ul className="flex list-disc flex-col gap-1.5 pl-5">
                {insights.tips.map((dica, i) => (
                  <li key={i} className="text-sm leading-relaxed">
                    {dica}
                  </li>
                ))}
              </ul>
            </>
          )}

          <form action={formAction}>
            <Button type="submit" variant="outline" disabled={pending} className="min-h-11 w-full">
              {pending ? 'Pedindo…' : 'Atualizar resumo'}
            </Button>
          </form>
        </div>
      )}
    </section>
  )
}
