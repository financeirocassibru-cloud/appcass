'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  approveBriefing,
  confirmProposal,
  discardJob,
  getAssistantSetup,
  pollJob,
  submitBriefing,
  type AssistantSetup,
  type BriefingView,
} from '@/lib/actions/assistant'
import type { JobView } from '@/lib/ai/jobs'
import { EDITABLE_FIELDS, isEditable } from '@/lib/ai/edits'
import type { Operation } from '@/lib/ai/proposal'
import type { DraftItem } from '@/lib/ai/triage'
import { MoneyInput } from '@/components/finance/money-input'
import { FormMessage } from '@/components/auth/form-field'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { formatCents } from '@/lib/finance/money'
import { cn } from '@/lib/utils'
import { useQuietFor } from './use-quiet-for'

/**
 * A caixa que convida a contar o que aconteceu. v1.1 — 2026-09-26.
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
 * ## v1.1 — virou conversa, em dois tempos
 *
 * Antes era um tiro só: escrever disparava o caminho pesado — oito queries de contexto e
 * uma interação com 27 ferramentas — e a primeira coisa na tela era "Pode fechar o app",
 * **antes de nada ter acontecido**. Se a IA entendesse errado, só se descobria no fim.
 *
 * Agora:
 *
 *  1. **triagem** (`submitBriefing`) — em um ou dois segundos a IA diz se o assunto é
 *     dinheiro e lê de volta, em português, o que entendeu. Nada foi gravado;
 *  2. a pessoa **confirma ou corrige conversando**, quantas vezes precisar;
 *  3. **proposta** (`approveBriefing`) — só depois do "É isso" é que nasce o trabalho
 *     pesado, levando o rascunho já aprovado;
 *  4. **confirmação**, agora com ajuste campo a campo.
 *
 * O aviso de fechar o app passou a esperar cinco segundos de espera de verdade
 * (`useQuietFor`). No caminho normal ele nunca aparece.
 */

const PLACEHOLDER = 'Ex.: paguei 87,50 no mercado hoje'

/** De quanto em quanto tempo perguntar se o trabalho terminou. */
const POLL_MS = 900

/** Quanto silêncio na tela antes de admitir que a espera é longa. */
const QUIET_MS = 5_000

type Variant = 'hero' | 'bar' | 'page'

interface Turn {
  role: 'user' | 'assistant'
  content: string
}

interface ProposalItem {
  description: string
  destructive: boolean
}

interface InterpretResult {
  operations?: Operation[]
  items?: ProposalItem[]
  message?: string | null
  rejected?: { name: string; reason: string }[]
}

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

/** A folha: conversar, conferir, ajustar, confirmar. */
function AssistantSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()

  const [turns, setTurns] = useState<Turn[]>([])
  const [briefing, setBriefing] = useState<BriefingView | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [job, setJob] = useState<JobView | null>(null)
  const [setup, setSetup] = useState<AssistantSetup | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [triando, setTriando] = useState(false)
  const [, iniciar] = useTransition()

  const textRef = useRef<HTMLTextAreaElement>(null)
  const fimRef = useRef<HTMLDivElement>(null)

  /**
   * O que a folha precisa para se montar, numa viagem só, quando ela abre.
   *
   * Não vem por prop porque a mesma folha é aberta de quatro lugares, e um deles é
   * cliente e não teria como buscar nada.
   */
  useEffect(() => {
    if (!open || setup) return
    let ativo = true

    void getAssistantSetup().then((lido) => {
      if (ativo) setSetup(lido)
    })

    return () => {
      ativo = false
    }
  }, [open, setup])

  /**
   * Acompanha o trabalho pesado enquanto a folha está aberta.
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

  const resultado = (job?.result ?? null) as InterpretResult | null
  const itens = resultado?.items ?? []
  const operacoes = resultado?.operations ?? []

  const esperandoProposta =
    Boolean(jobId) && (!job || job.status === 'queued' || job.status === 'running')
  const esperando = triando || esperandoProposta

  // Cada espera é um trecho novo: a triagem, de um ou dois segundos, nunca chega a
  // mostrar o aviso; a proposta, que pode levar vinte, mostra.
  const avisoLongo = useQuietFor(QUIET_MS, esperando)

  // Rolar para o fim a cada fala nova, senão a resposta nasce fora da tela.
  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [turns.length, briefing, job?.status])

  const zerar = useCallback(() => {
    setTurns([])
    setBriefing(null)
    setJobId(null)
    setJob(null)
    setErro(null)
    setTriando(false)
  }, [])

  const fechar = useCallback(() => {
    onOpenChange(false)
    // O estado volta ao zero um instante depois, para a folha não piscar vazia
    // enquanto desliza para baixo.
    setTimeout(zerar, 250)
  }, [onOpenChange, zerar])

  /** O texto das falas da pessoa, que é o que o caminho pesado reinterpreta. */
  const textoAcumulado = useMemo(
    () =>
      turns
        .filter((t) => t.role === 'user')
        .map((t) => t.content)
        .join(' '),
    [turns],
  )

  /** Manda o que a pessoa escreveu para a triagem. */
  const enviar = useCallback(
    (texto: string) => {
      const limpo = texto.trim()
      if (limpo.length < 2) return

      const historico = [...turns, { role: 'user' as const, content: limpo }]
      setTurns(historico)
      setBriefing(null)
      setErro(null)
      setTriando(true)
      if (textRef.current) textRef.current.value = ''

      iniciar(async () => {
        const formData = new FormData()
        formData.set('text', limpo)
        formData.set('turns', JSON.stringify(turns))

        const resposta = await submitBriefing({}, formData)
        setTriando(false)

        if (resposta.error) {
          setErro(resposta.error)
          return
        }

        if (resposta.briefing) {
          setBriefing(resposta.briefing)
          setTurns([...historico, { role: 'assistant', content: resposta.briefing.reply }])
          return
        }

        // Sem briefing: a triagem não respondeu e o servidor caiu para o caminho pesado.
        if (resposta.jobId) {
          setJobId(resposta.jobId)
          setJob(null)
        }
      })
    },
    [turns],
  )

  /** "É isso" — daqui em diante é o processo pesado. */
  const aprovar = useCallback(() => {
    if (!briefing) return

    setErro(null)

    iniciar(async () => {
      const formData = new FormData()
      formData.set('text', textoAcumulado)
      formData.set('draft', JSON.stringify(briefing.items))
      formData.set('turns', JSON.stringify(turns))

      const resposta = await approveBriefing({}, formData)

      if (resposta.error) {
        setErro(resposta.error)
        return
      }

      setBriefing(null)
      if (resposta.jobId) {
        setJobId(resposta.jobId)
        setJob(null)
      }
    })
  }, [briefing, textoAcumulado, turns])

  /** "Não era isso" durante a proposta: descarta e volta a conversar. */
  const voltarAConversar = useCallback(() => {
    const atual = jobId
    setJobId(null)
    setJob(null)
    setErro(null)

    if (!atual) return

    iniciar(async () => {
      const formData = new FormData()
      formData.set('jobId', atual)
      await discardJob({}, formData)
    })
  }, [jobId])

  const mostrarCaixa = !esperando && !jobId
  const propostaPronta = job?.status === 'completed' && itens.length > 0

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Conte o que aconteceu</SheetTitle>
          <SheetDescription>
            Escreva como você falaria. Eu digo o que entendi antes de registrar qualquer coisa.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4 pb-6">
          <Conversa turns={turns} />

          {esperando && <Digitando />}

          {setup?.showReasoning && esperando && (
            <Etapas etapa={triando ? 'triagem' : 'proposta'} model={job?.model ?? null} attempts={job?.attempts ?? 0} />
          )}

          {avisoLongo && (
            <p role="status" className="text-muted-foreground text-xs">
              Está demorando mais que o normal. Pode fechar o app — eu continuo e aviso quando
              terminar.
            </p>
          )}

          {briefing && !briefing.pertinent && (
            <p className="text-muted-foreground text-xs">
              Nada foi registrado. Me conte o que entrou ou saiu e eu cuido do resto.
            </p>
          )}

          {briefing?.pertinent && (
            <RascunhoConferencia
              items={briefing.items}
              question={briefing.question}
              onAprovar={aprovar}
            />
          )}

          <FormMessage error={erro ?? undefined} />

          {job?.status === 'failed' && (
            <>
              <FormMessage error={job.error ?? 'Não consegui processar.'} />
              <Button variant="outline" onClick={voltarAConversar} className="min-h-11">
                Tentar de novo
              </Button>
            </>
          )}

          {propostaPronta && (
            <ProposalReview
              jobId={job.id}
              items={itens}
              operations={operacoes}
              categories={setup?.categories ?? []}
              onDone={() => {
                fechar()
                // Sem isto, a tela por trás continuaria mostrando o saldo velho.
                router.refresh()
              }}
              onReject={voltarAConversar}
            />
          )}

          {job?.status === 'completed' && itens.length === 0 && (
            <>
              <p className="bg-[var(--surface)] rounded-lg p-3 text-sm">
                {resultado?.message ?? 'Não consegui entender. Tente contar com outras palavras.'}
              </p>
              <Button variant="outline" onClick={voltarAConversar} className="min-h-11">
                Contar de outro jeito
              </Button>
            </>
          )}

          {esperandoProposta && (
            <Button variant="ghost" onClick={voltarAConversar} className="min-h-11 text-sm">
              Não era isso
            </Button>
          )}

          {mostrarCaixa && (
            <form
              onSubmit={(event) => {
                event.preventDefault()
                enviar(textRef.current?.value ?? '')
              }}
              className="flex flex-col gap-3"
            >
              <textarea
                ref={textRef}
                name="text"
                rows={turns.length > 0 ? 2 : 4}
                autoFocus
                required
                minLength={2}
                maxLength={2000}
                placeholder={turns.length > 0 ? 'Corrija ou acrescente algo…' : PLACEHOLDER}
                onKeyDown={(event) => {
                  // Enter envia, Shift+Enter quebra linha: é o que a pessoa espera de uma
                  // caixa de conversa, e uma frase de lançamento raramente tem parágrafo.
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    enviar(event.currentTarget.value)
                  }
                }}
                className="border-input bg-card focus-visible:ring-ring w-full rounded-xl border p-3 text-base focus-visible:ring-2 focus-visible:outline-none"
              />
              <Button type="submit" className="min-h-12 text-base">
                Enviar
              </Button>
            </form>
          )}

          <div ref={fimRef} />
        </div>
      </SheetContent>
    </Sheet>
  )
}

/** Os balões da conversa. A pessoa à direita, a IA à esquerda. */
function Conversa({ turns }: { turns: readonly Turn[] }) {
  if (turns.length === 0) return null

  return (
    <ol className="flex flex-col gap-2">
      {turns.map((turn, indice) => (
        <li
          key={`${indice}-${turn.role}`}
          className={cn(
            'max-w-[85%] rounded-2xl px-3 py-2 text-sm',
            turn.role === 'user'
              ? 'bg-primary text-primary-foreground self-end rounded-br-sm'
              : 'self-start rounded-bl-sm bg-[var(--surface)]',
          )}
        >
          {turn.content}
        </li>
      ))}
    </ol>
  )
}

/**
 * Três pontos, e nada de texto.
 *
 * O que a pessoa precisa saber é que alguém está do outro lado. Uma frase aqui teria de
 * ser lida, e ela seria substituída em um segundo pela resposta de verdade.
 */
function Digitando() {
  return (
    <p role="status" aria-label="Pensando" className="flex gap-1 self-start px-3 py-2">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="bg-muted-foreground/50 size-1.5 animate-pulse rounded-full"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </p>
  )
}

/**
 * A trilha de etapas, quando ligada em Ajustes › IA.
 *
 * **São etapas de verdade, não raciocínio inventado.** O que aparece aqui é o que o app
 * sabe que está fazendo, mais o modelo que respondeu e o número de quedas. Encher isto
 * com frases de pensamento fabricadas faria a espera parecer trabalhosa sem dizer nada
 * verdadeiro — e num app de dinheiro isso é só enfeite mentiroso.
 */
function Etapas({
  etapa,
  model,
  attempts,
}: {
  etapa: 'triagem' | 'proposta'
  model: string | null
  attempts: number
}) {
  const passos =
    etapa === 'triagem'
      ? ['Lendo o que você escreveu']
      : [
          'Montei o retrato das suas contas',
          model ? `Perguntei ao ${model}` : 'Enviando ao modelo',
          ...(attempts > 0 ? [`O modelo anterior demorou; estou no ${attempts + 1}º`] : []),
          'Traduzindo para lançamentos',
        ]

  return (
    <ol aria-live="polite" className="text-muted-foreground flex flex-col gap-0.5 text-xs">
      {passos.map((passo) => (
        <li key={passo}>· {passo}</li>
      ))}
    </ol>
  )
}

/**
 * O rascunho lido de volta, com o "É isso".
 *
 * Os cartões repetem em números o que a fala da IA já disse em palavras. Não é redundância
 * inútil: ler "R$ 2.000,00" numa linha própria é o que faz um erro de vírgula salta ao
 * olho antes de qualquer coisa ser registrada.
 */
function RascunhoConferencia({
  items,
  question,
  onAprovar,
}: {
  items: readonly DraftItem[]
  question: string | null
  onAprovar: () => void
}) {
  // Sem item nenhum, a IA está perguntando algo — e aí quem responde é a caixa de texto,
  // não um botão de aprovar um rascunho que não existe.
  if (items.length === 0) return null

  const faltando = items.flatMap((item) => item.missing)

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-1.5">
        {items.map((item, indice) => (
          <li
            key={indice}
            className="flex items-baseline justify-between gap-3 rounded-lg bg-[var(--surface)] px-3 py-2 text-sm"
          >
            <span>{item.description ?? 'Sem descrição'}</span>
            <span className="tabular text-muted-foreground shrink-0 text-xs">
              {item.amount_cents === null ? 'valor?' : formatCents(item.amount_cents)}
              {item.occurred_on !== null && ` · ${diaEMes(item.occurred_on)}`}
            </span>
          </li>
        ))}
      </ul>

      {faltando.length > 0 && (
        <p className="text-muted-foreground text-xs">Ainda falta: {faltando.join(', ')}.</p>
      )}

      {question !== null && <p className="text-sm">{question}</p>}

      <Button onClick={onAprovar} className="min-h-12 text-base">
        É isso
      </Button>
      <p className="text-muted-foreground text-center text-xs">
        Se não for, escreva a correção abaixo. Nada foi registrado ainda.
      </p>
    </div>
  )
}

/** `2026-09-26` → `26/09`. Fatiamento de string, nunca `Date` (invariante 2). */
function diaEMes(iso: string): string {
  const [, mes, dia] = iso.split('-')
  return mes && dia ? `${dia}/${mes}` : iso
}

/** Campos que viram número ao voltar do formulário. */
const CAMPOS_NUMERICOS = new Set([
  'amount_cents',
  'total_amount_cents',
  'target_amount_cents',
  'installments_count',
  'day_of_month',
])

/** Campos que viram booleano ao voltar do formulário. */
const CAMPOS_BOOLEANOS = new Set(['is_settled'])

/**
 * O cartão de conferência, agora com ajuste.
 *
 * Existe por um motivo só: deixar óbvio se a IA entendeu errado, **antes** de
 * qualquer escrita. Por isso mostra valor, data e o nome do registro alvo, em
 * português, e destaca o que apaga.
 *
 * ## O que é editável, e o que nunca será
 *
 * Valor, data, descrição, categoria e "já aconteceu" são ajustáveis, porque são o que uma
 * pessoa digitaria. O **alvo** não: `op`, `id`, `rule_id`, `goal_id` e `scenario_id` não
 * saem do formulário, e o servidor os ignora por lista branca (`lib/ai/edits.ts`). A
 * razão é específica: a RLS barra um id de outra pessoa, mas não barraria trocar "apague o
 * lançamento do mercado" por "apague o salário" — as duas linhas são dela.
 *
 * Operação que apaga não tem campo nenhum para ajustar. O que se faz com ela é remover da
 * proposta.
 */
function ProposalReview({
  jobId,
  items,
  operations,
  categories,
  onDone,
  onReject,
}: {
  jobId: string
  items: readonly ProposalItem[]
  operations: readonly Operation[]
  categories: AssistantSetup['categories']
  onDone: () => void
  onReject: () => void
}) {
  const [abertos, setAbertos] = useState<ReadonlySet<number>>(new Set())
  const [removidos, setRemovidos] = useState<ReadonlySet<number>>(new Set())
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const temExclusao = items.some((item) => item.destructive)
  const restantes = items.filter((_, indice) => !removidos.has(indice)).length

  const alternar = (indice: number, conjunto: ReadonlySet<number>) => {
    const novo = new Set(conjunto)
    if (novo.has(indice)) novo.delete(indice)
    else novo.add(indice)
    return novo
  }

  /**
   * Monta os ajustes a partir do próprio formulário.
   *
   * Só vai o que **mudou** em relação à operação original: assim o `changed` do servidor
   * é verdade, e o histórico não registra ajuste onde ninguém ajustou nada.
   */
  const confirmar = async (formData: FormData) => {
    setErro(null)
    setEnviando(true)

    const edits: { index: number; fields: Record<string, unknown> }[] = []

    operations.forEach((operation, indice) => {
      if (removidos.has(indice) || !abertos.has(indice)) return

      const permitidos = EDITABLE_FIELDS[operation.op] ?? []
      const fields: Record<string, unknown> = {}

      for (const campo of permitidos) {
        const bruto = formData.get(`edit:${indice}:${campo}`)
        if (bruto === null) continue

        const valor = converter(campo, String(bruto))
        const atual = (operation as unknown as Record<string, unknown>)[campo] ?? null

        if (valor !== atual) fields[campo] = valor
      }

      if (Object.keys(fields).length > 0) edits.push({ index: indice, fields })
    })

    const payload = new FormData()
    payload.set('jobId', jobId)
    payload.set('edits', JSON.stringify(edits))
    payload.set('removed', JSON.stringify([...removidos]))

    const resposta = await confirmProposal({}, payload)
    setEnviando(false)

    if (resposta.success) {
      toast.success(resposta.success)
      onDone()
      return
    }

    setErro(resposta.error ?? 'Não consegui registrar.')
  }

  const descartar = async () => {
    setEnviando(true)
    const payload = new FormData()
    payload.set('jobId', jobId)
    const resposta = await discardJob({}, payload)
    setEnviando(false)

    if (resposta.success) {
      toast('Descartado. Nada foi registrado.')
      onDone()
    }
  }

  return (
    <form action={confirmar} className="flex flex-col gap-4">
      <p className="text-sm font-medium">
        {items.length === 1 ? 'Entendi assim:' : `Entendi ${items.length} coisas:`}
      </p>

      <ul className="flex flex-col gap-2">
        {items.map((item, indice) => {
          const operation = operations[indice]
          const removido = removidos.has(indice)
          const aberto = abertos.has(indice)
          const ajustavel = operation !== undefined && isEditable(operation.op)

          return (
            <li
              key={`${indice}-${item.description}`}
              className={cn(
                'rounded-lg border p-3 text-sm',
                removido && 'opacity-50',
                item.destructive
                  ? 'border-[var(--color-expense)] bg-[var(--color-expense-soft)] text-[var(--color-expense)]'
                  : 'bg-[var(--surface)]',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <span className={cn(removido && 'line-through')}>{item.description}</span>

                <div className="flex shrink-0 gap-2">
                  {ajustavel && !removido && (
                    <button
                      type="button"
                      onClick={() => setAbertos((atual) => alternar(indice, atual))}
                      className="text-xs underline"
                    >
                      {aberto ? 'Fechar' : 'Ajustar'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setRemovidos((atual) => alternar(indice, atual))}
                    className="text-xs underline"
                  >
                    {removido ? 'Devolver' : 'Remover'}
                  </button>
                </div>
              </div>

              {aberto && !removido && operation !== undefined && (
                <CamposDeAjuste indice={indice} operation={operation} categories={categories} />
              )}
            </li>
          )
        })}
      </ul>

      {temExclusao && (
        <p className="text-muted-foreground text-xs">
          O que está em vermelho apaga um registro. Confira antes de confirmar. Nele não há o
          que ajustar — se não é isso, remova da proposta.
        </p>
      )}

      <FormMessage error={erro ?? undefined} />

      <div className="flex flex-col gap-2">
        <Button
          type="submit"
          disabled={enviando || restantes === 0}
          className="min-h-12 w-full text-base"
        >
          {enviando
            ? 'Registrando…'
            : abertos.size > 0
              ? 'Confirmar com meus ajustes'
              : 'Confirmar'}
        </Button>

        <Button
          type="button"
          variant="outline"
          onClick={() => void descartar()}
          disabled={enviando}
          className="min-h-11 w-full"
        >
          Descartar
        </Button>

        <Button
          type="button"
          variant="ghost"
          onClick={onReject}
          disabled={enviando}
          className="min-h-11 w-full text-sm"
        >
          Explicar de outro jeito
        </Button>
      </div>
    </form>
  )
}

/** Converte o texto do formulário para o tipo que o `operationSchema` espera. */
function converter(campo: string, bruto: string): unknown {
  if (CAMPOS_BOOLEANOS.has(campo)) return bruto === 'true'

  if (CAMPOS_NUMERICOS.has(campo)) {
    if (bruto === '') return null
    // `Number` e não `parseFloat`: o valor já vem em centavos inteiros do MoneyInput, e
    // um `parseFloat` aqui seria a porta de entrada do bug que o invariante 1 impede.
    const numero = Number(bruto)
    return Number.isInteger(numero) ? numero : bruto
  }

  return bruto === '' ? null : bruto
}

/**
 * Os campos de ajuste de uma operação.
 *
 * O valor usa o `MoneyInput` que as telas de lançamento já usam: o estado dele **é** o
 * número de centavos, então não existe ponto nenhum do caminho em que o valor seja
 * `parseFloat` de uma string. A data usa `<input type="date">`, que fala `YYYY-MM-DD`
 * nativamente — nada de `new Date()` no meio, que deslocaria o dia em fuso negativo.
 */
function CamposDeAjuste({
  indice,
  operation,
  categories,
}: {
  indice: number
  operation: Operation
  categories: AssistantSetup['categories']
}) {
  const permitidos = EDITABLE_FIELDS[operation.op] ?? []
  const dados = operation as unknown as Record<string, unknown>
  const nome = (campo: string) => `edit:${indice}:${campo}`

  return (
    <div className="mt-3 flex flex-col gap-3 border-t pt-3">
      {permitidos.map((campo) => {
        if (CAMPOS_NUMERICOS.has(campo) && campo.endsWith('_cents')) {
          return (
            <MoneyInput
              key={campo}
              name={nome(campo)}
              label={rotuloDoCampo(campo)}
              initialCents={typeof dados[campo] === 'number' ? (dados[campo] as number) : 0}
              compact
            />
          )
        }

        if (campo === 'category_id') {
          return (
            <Campo key={campo} label="Categoria">
              <select
                name={nome(campo)}
                defaultValue={typeof dados[campo] === 'string' ? (dados[campo] as string) : ''}
                className="border-input bg-card min-h-11 rounded-xl border px-3 text-base"
              >
                <option value="">Sem categoria</option>
                {categories.map((categoria) => (
                  <option key={categoria.id} value={categoria.id}>
                    {categoria.name}
                  </option>
                ))}
              </select>
            </Campo>
          )
        }

        if (campo === 'is_settled') {
          return (
            <Campo key={campo} label="Já aconteceu">
              <select
                name={nome(campo)}
                defaultValue={dados[campo] === true ? 'true' : 'false'}
                className="border-input bg-card min-h-11 rounded-xl border px-3 text-base"
              >
                <option value="true">Sim, já foi</option>
                <option value="false">Não, está previsto</option>
              </select>
            </Campo>
          )
        }

        if (campo === 'frequency') {
          return (
            <Campo key={campo} label="Repete">
              <select
                name={nome(campo)}
                defaultValue={typeof dados[campo] === 'string' ? (dados[campo] as string) : 'monthly'}
                className="border-input bg-card min-h-11 rounded-xl border px-3 text-base"
              >
                <option value="monthly">Todo mês</option>
                <option value="weekly">Toda semana</option>
                <option value="yearly">Todo ano</option>
              </select>
            </Campo>
          )
        }

        const ehData = DATAS.has(campo)

        return (
          <Campo key={campo} label={rotuloDoCampo(campo)}>
            <input
              name={nome(campo)}
              type={ehData ? 'date' : CAMPOS_NUMERICOS.has(campo) ? 'number' : 'text'}
              defaultValue={typeof dados[campo] === 'string' || typeof dados[campo] === 'number' ? String(dados[campo]) : ''}
              {...(campo === 'day_of_month' ? { min: 1, max: 31 } : {})}
              {...(campo === 'installments_count' ? { min: 2, max: 360 } : {})}
              className="border-input bg-card min-h-11 rounded-xl border px-3 text-base"
            />
          </Campo>
        )
      })}
    </div>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-muted-foreground text-sm font-medium">{label}</span>
      {children}
    </label>
  )
}

/** Campos que são data de competência — `<input type="date">`, sempre. */
const DATAS = new Set([
  'occurred_on',
  'starts_on',
  'ends_on',
  'first_due_on',
  'target_date',
  'occurs_on',
])

const ROTULOS_DE_CAMPO: Record<string, string> = {
  amount_cents: 'Valor',
  total_amount_cents: 'Valor total',
  target_amount_cents: 'Quanto quer juntar',
  occurred_on: 'Data',
  starts_on: 'Começa em',
  first_due_on: 'Primeira parcela',
  target_date: 'Até quando',
  occurs_on: 'Data',
  description: 'Descrição',
  name: 'Nome',
  note: 'Observação',
  installments_count: 'Parcelas',
  day_of_month: 'Dia do mês',
}

function rotuloDoCampo(campo: string): string {
  return ROTULOS_DE_CAMPO[campo] ?? campo
}
