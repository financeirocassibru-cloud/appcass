'use client'

import { useActionState, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  confirmProposal,
  discardJob,
  pollJob,
  submitMessage,
  type AssistantActionState,
} from '@/lib/actions/assistant'
import type { JobView } from '@/lib/ai/jobs'
import { FormMessage } from '@/components/auth/form-field'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

/**
 * A caixa que convida a contar o que aconteceu. v1.0 — 2026-09-26.
 *
 * **Sem ícone de IA.** Nada de estrelinha, robô ou faísca: o convite é a própria
 * caixa, com um exemplo dentro. Um ícone genérico exigiria que a pessoa já
 * soubesse o que ele significa; a frase "Conte o que aconteceu" não exige nada.
 *
 * Três tamanhos do mesmo componente, que é como o pedido de "estar em toda
 * parte" se resolve sem repetir código:
 *
 *  - `hero` — grande, no Início, logo abaixo do saldo;
 *  - `bar`  — uma linha, ancorada acima da barra inferior, em qualquer tela;
 *  - `page` — grande, na tela do assistente.
 *
 * Tocar em qualquer um abre a MESMA folha, onde a pessoa escreve, acompanha e
 * confirma.
 */

const PLACEHOLDER = 'Ex.: paguei 87,50 no mercado hoje'

/** De quanto em quanto tempo perguntar se o trabalho terminou. */
const POLL_MS = 900

type Variant = 'hero' | 'bar' | 'page'

interface ProposalItem {
  description: string
  destructive: boolean
}

interface InterpretResult {
  items?: ProposalItem[]
  message?: string | null
  rejected?: { name: string; reason: string }[]
}

const initialState: AssistantActionState = {}

export function AssistantComposer({ variant = 'hero' }: { variant?: Variant }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <ComposerTrigger variant={variant} onOpen={() => setOpen(true)} />
      <AssistantSheet open={open} onOpenChange={setOpen} />
    </>
  )
}

/**
 * O convite.
 *
 * É um `<button>` com cara de campo de texto, e não um `<input>` de verdade:
 * escrever acontece na folha, com espaço para várias linhas e para a
 * confirmação logo abaixo. Um input aqui abriria o teclado numa caixa de uma
 * linha que some quando a folha sobe.
 */
function ComposerTrigger({ variant, onOpen }: { variant: Variant; onOpen: () => void }) {
  if (variant === 'bar') {
    return (
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 pb-[calc(env(safe-area-inset-bottom)+4.5rem)]">
        <div className="mx-auto max-w-md px-4">
          <button
            type="button"
            onClick={onOpen}
            className="bg-card text-muted-foreground pointer-events-auto flex min-h-11 w-full items-center rounded-full border px-4 text-left text-sm shadow-lg"
          >
            Conte o que aconteceu…
          </button>
        </div>
      </div>
    )
  }

  return (
    <section className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          'bg-card flex w-full flex-col gap-1 rounded-xl border p-5 text-left transition-colors',
          'hover:bg-[var(--surface)] focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
        )}
      >
        <span className="text-base font-semibold">Conte o que aconteceu</span>
        <span className="text-muted-foreground text-sm">{PLACEHOLDER}</span>
      </button>
    </section>
  )
}

/** A folha: escrever, acompanhar, conferir, confirmar. */
function AssistantSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [job, setJob] = useState<JobView | null>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)

  const [state, formAction, pending] = useActionState(
    async (prev: AssistantActionState, formData: FormData) => {
      const result = await submitMessage(prev, formData)
      if (result.jobId) setJob(null)
      return result
    },
    initialState,
  )

  const jobId = state.jobId

  /**
   * Acompanha o trabalho enquanto a folha está aberta.
   *
   * O poll não é a única forma de o resultado chegar — o `after()` do servidor e
   * a varredura do cron também fecham o trabalho, e é por isso que fechar o app
   * no meio não perde nada. Aqui ele existe para quem ficou olhando ver o
   * resultado aparecer sem recarregar.
   */
  useEffect(() => {
    if (!jobId || !open) return
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
  }, [jobId, open])

  const fechar = useCallback(() => {
    onOpenChange(false)
    // O estado volta ao zero um instante depois, para a folha não piscar vazia
    // enquanto desliza para baixo.
    setTimeout(() => setJob(null), 250)
  }, [onOpenChange])

  const resultado = (job?.result ?? null) as InterpretResult | null
  const itens = resultado?.items ?? []
  const trabalhando = Boolean(jobId) && (!job || job.status === 'queued' || job.status === 'running')

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Conte o que aconteceu</SheetTitle>
          <SheetDescription>
            Escreva como você falaria. Eu mostro o que entendi antes de registrar qualquer coisa.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4 pb-6">
          {!jobId && (
            <form action={formAction} className="flex flex-col gap-3">
              <textarea
                ref={textRef}
                name="text"
                rows={4}
                autoFocus
                required
                minLength={2}
                maxLength={2000}
                placeholder={PLACEHOLDER}
                className="border-input bg-card focus-visible:ring-ring w-full rounded-xl border p-3 text-base focus-visible:ring-2 focus-visible:outline-none"
              />
              <FormMessage error={state.error} />
              <Button type="submit" disabled={pending} className="min-h-12 text-base">
                {pending ? 'Enviando…' : 'Enviar'}
              </Button>
            </form>
          )}

          {trabalhando && (
            <p role="status" className="text-muted-foreground py-6 text-center text-sm">
              Lendo o que você escreveu…
              <br />
              <span className="text-xs">
                Pode fechar o app: eu continuo e aviso quando terminar.
              </span>
            </p>
          )}

          {job?.status === 'failed' && (
            <>
              <FormMessage error={job.error ?? 'Não consegui processar.'} />
              <Button variant="outline" onClick={fechar} className="min-h-11">
                Fechar
              </Button>
            </>
          )}

          {job?.status === 'completed' && itens.length > 0 && (
            <ProposalReview
              jobId={job.id}
              items={itens}
              onDone={() => {
                fechar()
                // Sem isto, a tela por trás continuaria mostrando o saldo velho.
                router.refresh()
              }}
            />
          )}

          {job?.status === 'completed' && itens.length === 0 && (
            <>
              <p className="bg-[var(--surface)] rounded-lg p-3 text-sm">
                {resultado?.message ?? 'Não consegui entender. Tente contar com outras palavras.'}
              </p>
              <Button variant="outline" onClick={fechar} className="min-h-11">
                Fechar
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

/**
 * O cartão de conferência.
 *
 * Existe por um motivo só: deixar óbvio se a IA entendeu errado, **antes** de
 * qualquer escrita. Por isso mostra valor, data e o nome do registro alvo, em
 * português, e destaca o que apaga.
 */
function ProposalReview({
  jobId,
  items,
  onDone,
}: {
  jobId: string
  items: ProposalItem[]
  onDone: () => void
}) {
  const [confirmState, confirmAction, confirming] = useActionState(
    async (prev: AssistantActionState, formData: FormData) => {
      const result = await confirmProposal(prev, formData)
      if (result.success) {
        toast.success(result.success)
        onDone()
      }
      return result
    },
    initialState,
  )

  const [, discardAction, discarding] = useActionState(
    async (prev: AssistantActionState, formData: FormData) => {
      const result = await discardJob(prev, formData)
      if (result.success) {
        toast('Descartado. Nada foi registrado.')
        onDone()
      }
      return result
    },
    initialState,
  )

  const temExclusao = items.some((item) => item.destructive)

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-medium">
        {items.length === 1 ? 'Entendi assim:' : `Entendi ${items.length} coisas:`}
      </p>

      <ul className="flex flex-col gap-2">
        {items.map((item, index) => (
          <li
            key={`${index}-${item.description}`}
            className={cn(
              'rounded-lg border p-3 text-sm',
              item.destructive
                ? 'border-[var(--color-expense)] bg-[var(--color-expense-soft)] text-[var(--color-expense)]'
                : 'bg-[var(--surface)]',
            )}
          >
            {item.description}
          </li>
        ))}
      </ul>

      {temExclusao && (
        <p className="text-muted-foreground text-xs">
          O que está em vermelho apaga um registro. Confira antes de confirmar.
        </p>
      )}

      <FormMessage error={confirmState.error} />

      <div className="flex flex-col gap-2">
        <form action={confirmAction}>
          <input type="hidden" name="jobId" value={jobId} />
          <Button
            type="submit"
            disabled={confirming || discarding}
            className="min-h-12 w-full text-base"
          >
            {confirming ? 'Registrando…' : 'Confirmar'}
          </Button>
        </form>

        <form action={discardAction}>
          <input type="hidden" name="jobId" value={jobId} />
          <Button
            type="submit"
            variant="outline"
            disabled={confirming || discarding}
            className="min-h-11 w-full"
          >
            Descartar
          </Button>
        </form>
      </div>
    </div>
  )
}
