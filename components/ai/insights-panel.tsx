'use client'

import { useActionState, useState } from 'react'
import { toast } from 'sonner'
import { requestInsights, type AssistantActionState } from '@/lib/actions/assistant'
import { FormMessage } from '@/components/auth/form-field'
import { Button } from '@/components/ui/button'
import { useQuietFor } from './use-quiet-for'

/**
 * Resumo da situação financeira. v1.2 — 2026-09-26.
 *
 * **Só sob demanda**, por decisão de produto: nada é gerado ao abrir a tela. O
 * botão é o gatilho, e enquanto ninguém o toca não há chamada nenhuma à API.
 *
 * O componente inteiro só é montado quando `ai_insights_enabled` é verdadeiro —
 * quem decide isso é a página, no servidor. Desligado nos ajustes, o botão não
 * fica cinza: ele não existe.
 *
 * ## v1.2 — nada de banco, nada de poll
 *
 * Antes o resumo era um trabalho em `ai_jobs`: a tela pedia, recebia um `jobId` e
 * perguntava de segundo em segundo se tinha terminado. Sumiu tudo isso. O resumo não é
 * um registro, é uma leitura — guardá-lo acumulava análises que ninguém ia reler, no
 * mesmo histórico dos lançamentos que a pessoa de fato pediu.
 *
 * Agora a action devolve o texto na própria resposta. Sem `jobId`, sem `pollJob`, sem
 * linha no banco. Quem quiser guardar, copia.
 *
 * O que se perde está dito na tela, não escondido: sem linha no banco não há varredura
 * para retomar nem aviso para chamar de volta, então a pessoa precisa ficar aqui
 * enquanto o resumo é montado. A mensagem dos 15 segundos diz exatamente isso, em vez
 * de repetir o "pode fechar o app" que valia para os lançamentos e aqui seria mentira.
 */

/** Quanto silêncio antes de admitir que a espera é longa. */
const QUIET_MS = 15_000

/** O padrão do campo de período. O recorte de verdade é do servidor. */
const DIAS_PADRAO = 30

const initialState: AssistantActionState = {}

export function InsightsPanel() {
  const [state, formAction, pending] = useActionState(requestInsights, initialState)
  const [copiado, setCopiado] = useState(false)

  const texto = state.insights?.text ?? null
  const demorando = useQuietFor(QUIET_MS, pending)

  async function copiar() {
    if (!texto) return

    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      toast.success('Resumo copiado.')
      setTimeout(() => setCopiado(false), 2_000)
    } catch {
      // Área de transferência barrada (sem HTTPS, permissão negada, navegador antigo):
      // dizer isso é melhor que um botão que não faz nada e não explica.
      toast.error('Não consegui copiar. Selecione o texto e copie à mão.')
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl bg-[var(--surface)] p-5">
      <h2 className="text-base font-semibold">Como estão suas finanças</h2>

      <form action={formAction} className="flex flex-col gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Últimos</span>
          <input
            type="number"
            name="dias"
            min={1}
            max={60}
            defaultValue={DIAS_PADRAO}
            inputMode="numeric"
            className="border-input bg-card focus-visible:border-primary min-h-11 w-20 rounded-lg border px-3 text-base outline-none"
          />
          <span className="text-muted-foreground">dias</span>
        </label>

        <Button type="submit" variant="outline" disabled={pending} className="min-h-11">
          {pending ? 'Olhando suas contas…' : texto ? 'Refazer o resumo' : 'Ver resumo'}
        </Button>
      </form>

      {pending && (
        <p role="status" className="text-muted-foreground text-sm">
          Estou olhando seus lançamentos…
        </p>
      )}

      {demorando && (
        <p role="status" className="text-muted-foreground text-xs">
          Está demorando um pouco. Preciso que você fique nesta tela até eu terminar — o
          resumo não fica guardado.
        </p>
      )}

      <FormMessage error={state.error ?? undefined} />

      {texto && (
        <>
          <div className="flex flex-col gap-3 text-sm leading-relaxed">
            {paragrafos(texto).map((paragrafo, indice) => (
              <p key={indice}>{paragrafo}</p>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-muted-foreground text-xs">
              {state.insights?.days === 1
                ? 'Com base no último dia.'
                : `Com base nos últimos ${state.insights?.days} dias.`}
            </p>
            <Button type="button" variant="outline" onClick={() => void copiar()} className="min-h-11">
              {copiado ? 'Copiado' : 'Copiar'}
            </Button>
          </div>
        </>
      )}
    </section>
  )
}

/**
 * Quebra o texto em parágrafos.
 *
 * Linha vazia separa, como o prompt pede ao modelo. Uma quebra simples no meio de uma
 * frase não vira parágrafo — ela sobrevive dentro do mesmo `<p>`, que é o que faz um
 * texto corrido continuar corrido.
 */
function paragrafos(texto: string): string[] {
  return texto
    .split(/\n\s*\n/)
    .map((bloco) => bloco.trim())
    .filter((bloco) => bloco !== '')
}
