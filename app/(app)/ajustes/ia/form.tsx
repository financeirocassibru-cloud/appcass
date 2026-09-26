'use client'

import { useActionState } from 'react'
import { toast } from 'sonner'
import {
  setAiModel,
  setInsightsEnabled,
  setNotificationsEnabled,
  type AiSettingsActionState,
} from '@/lib/actions/ai-settings'
import { PushSetup } from '@/components/ai/push-setup'
import { FormMessage } from '@/components/auth/form-field'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const initialState: AiSettingsActionState = {}

/**
 * Os interruptores da IA. v1.0 — 2026-09-26.
 *
 * Três ajustes, e um aviso que não é opcional: a tela diz, com todas as letras,
 * quais dados saem daqui para o Gemini. Num app de dinheiro isso não é letra
 * miúda — e desligar o resumo não é desculpa para esconder a informação, já que
 * a caixa de lançar continua mandando o mesmo retrato.
 */
export function AiSettingsForm({
  insightsEnabled,
  notificationsEnabled,
  model,
  models,
  aiConfigured,
  pushConfigured,
  vapidPublicKey,
}: {
  insightsEnabled: boolean
  notificationsEnabled: boolean
  model: string
  models: string[]
  aiConfigured: boolean
  pushConfigured: boolean
  vapidPublicKey: string
}) {
  return (
    <div className="flex flex-col gap-8">
      {!aiConfigured && (
        <p className="rounded-lg bg-[var(--color-expense-soft)] px-3 py-2 text-sm text-[var(--color-expense)]">
          O assistente está desligado neste ambiente: falta a variável GEMINI_API_KEY.
        </p>
      )}

      <Toggle
        titulo="Resumo e dicas"
        descricao="Mostra um resumo da sua situação financeira e sugestões, quando você pedir. Desligado, o botão some do Início e da tela do assistente."
        enabled={insightsEnabled}
        action={setInsightsEnabled}
      />

      <Toggle
        titulo="Avisar quando terminar"
        descricao="A IA continua trabalhando com o app fechado. Este aviso é o que te chama de volta quando ela termina."
        enabled={notificationsEnabled}
        action={setNotificationsEnabled}
      />

      {notificationsEnabled &&
        (pushConfigured ? (
          <PushSetup vapidPublicKey={vapidPublicKey} />
        ) : (
          <p className="text-muted-foreground text-sm">
            Os avisos não estão configurados neste ambiente: faltam as chaves VAPID.
          </p>
        ))}

      <ModelPicker model={model} models={models} />

      <section className="flex flex-col gap-2 rounded-lg bg-[var(--surface)] p-4">
        <h2 className="text-sm font-semibold">O que é enviado para a IA</h2>
        <p className="text-muted-foreground text-sm">
          Para entender o que você escreve, o assistente envia ao Gemini um retrato das suas
          finanças: saldo, categorias, os lançamentos mais recentes, contas fixas, parcelamentos,
          metas e cenários. O resumo envia totais já calculados. Seu e-mail e sua senha nunca são
          enviados.
        </p>
      </section>
    </div>
  )
}

/**
 * Um interruptor que salva sozinho.
 *
 * Sem botão "salvar": são três campos independentes, e um botão a mais faria a
 * pessoa achar que esqueceu de confirmar. O `<form>` com `<button>` de valor é
 * o que mantém isso funcionando sem JavaScript no caminho crítico.
 */
function Toggle({
  titulo,
  descricao,
  enabled,
  action,
}: {
  titulo: string
  descricao: string
  enabled: boolean
  action: (prev: AiSettingsActionState, formData: FormData) => Promise<AiSettingsActionState>
}) {
  const [state, formAction, pending] = useActionState(
    async (prev: AiSettingsActionState, formData: FormData) => {
      const result = await action(prev, formData)
      if (result.success) toast.success(result.success)
      return result
    },
    initialState,
  )

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold">{titulo}</span>
          <span className="text-muted-foreground text-sm">{descricao}</span>
        </div>

        <button
          type="submit"
          name="enabled"
          value={enabled ? 'false' : 'true'}
          role="switch"
          aria-checked={enabled}
          aria-label={titulo}
          disabled={pending}
          className={cn(
            'relative h-7 w-12 shrink-0 rounded-full transition-colors',
            enabled ? 'bg-primary' : 'bg-muted',
          )}
        >
          <span
            className={cn(
              'bg-card absolute top-1 size-5 rounded-full shadow transition-all',
              enabled ? 'left-6' : 'left-1',
            )}
            aria-hidden
          />
        </button>
      </div>

      <FormMessage error={state.error} />
    </form>
  )
}

/**
 * A escolha do modelo.
 *
 * A lista está em ordem de lançamento, do mais recente para o mais antigo, e
 * "Automático" é o primeiro dela. A escolha aqui é o PONTO DE PARTIDA, não uma
 * amarra: se o modelo escolhido demorar, o app cai para o seguinte da lista
 * sozinho — que é exatamente o que se quer de um assistente que não pode ficar
 * esperando.
 */
function ModelPicker({ model, models }: { model: string; models: string[] }) {
  const [state, formAction, pending] = useActionState(
    async (prev: AiSettingsActionState, formData: FormData) => {
      const result = await setAiModel(prev, formData)
      if (result.success) toast.success(result.success)
      return result
    },
    initialState,
  )

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <Label htmlFor="campo-modelo">Modelo</Label>

      <select
        id="campo-modelo"
        name="model"
        defaultValue={model}
        className="border-input bg-card min-h-11 rounded-lg border px-3 text-base"
      >
        <option value="">Automático (mais recente)</option>
        {models.map((nome) => (
          <option key={nome} value={nome}>
            {nome}
          </option>
        ))}
      </select>

      <p className="text-muted-foreground text-xs">
        Se o modelo escolhido demorar para responder, o app tenta o seguinte da lista
        automaticamente.
      </p>

      <FormMessage error={state.error} />

      <Button type="submit" variant="outline" disabled={pending} className="min-h-11">
        {pending ? 'Salvando…' : 'Salvar modelo'}
      </Button>
    </form>
  )
}
