'use server'

import { revalidatePath } from 'next/cache'
import { currentUserId } from '@/lib/db/current-user'
import type { AiSettingsPatch } from '@/lib/db/types'
import { createClient } from '@/lib/supabase/server'
import {
  pushSubscriptionSchema,
  setModelSchema,
  toggleInsightsSchema,
  toggleNotificationsSchema,
} from '@/lib/validation/assistant'

/**
 * Ajustes da IA. v1.0 — 2026-09-26.
 *
 * As três preferências vivem em `profiles`, e a migration 0012 concedeu
 * `update` **só** nessas colunas (invariante 15). Sem aquele grant, tudo aqui
 * falharia com `insufficient_privilege`: a 0008 revogou o UPDATE de tabela
 * inteira em `profiles`, e concessão por coluna não alcança coluna criada
 * depois.
 *
 * Todo `update` leva `.eq()` e `.select()` com verificação de linha casada. O
 * `.eq()` porque o PostgREST recusa UPDATE sem WHERE **antes** de a RLS entrar
 * em cena; o `.select()` porque o supabase-js devolve sucesso quando nada casou
 * (invariantes 3 e 17). Foi exatamente esse par que faltou na tela de ajustar
 * saldo e chegou quebrado em produção.
 */

export interface AiSettingsActionState {
  error?: string
  success?: string
}

async function updateProfile(
  patch: AiSettingsPatch,
  mensagem: string,
): Promise<AiSettingsActionState> {
  const userId = await currentUserId()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', userId)
    .select('id')

  if (error) return { error: `Não foi possível salvar: ${error.message}` }
  if (!data || data.length === 0) return { error: 'Perfil não encontrado.' }

  revalidatePath('/ajustes/ia')
  revalidatePath('/assistente')
  revalidatePath('/')

  return { success: mensagem }
}

/** Liga e desliga o resumo e as dicas. */
export async function setInsightsEnabled(
  _prev: AiSettingsActionState,
  formData: FormData,
): Promise<AiSettingsActionState> {
  const parsed = toggleInsightsSchema.safeParse({ enabled: formData.get('enabled') })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  return await updateProfile(
    { ai_insights_enabled: parsed.data.enabled },
    parsed.data.enabled ? 'Resumo e dicas ligados.' : 'Resumo e dicas desligados.',
  )
}

/** Liga e desliga o aviso de quando o trabalho da IA termina. */
export async function setNotificationsEnabled(
  _prev: AiSettingsActionState,
  formData: FormData,
): Promise<AiSettingsActionState> {
  const parsed = toggleNotificationsSchema.safeParse({ enabled: formData.get('enabled') })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  return await updateProfile(
    { ai_notifications_enabled: parsed.data.enabled },
    parsed.data.enabled ? 'Avisos ligados.' : 'Avisos desligados.',
  )
}

/** Escolhe o modelo. `null` volta ao padrão, que é o mais recente da cadeia. */
export async function setAiModel(
  _prev: AiSettingsActionState,
  formData: FormData,
): Promise<AiSettingsActionState> {
  const parsed = setModelSchema.safeParse({ model: formData.get('model') })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  return await updateProfile(
    { ai_model: parsed.data.model },
    parsed.data.model ? `Modelo definido: ${parsed.data.model}.` : 'Voltou para o modelo padrão.',
  )
}

/**
 * Guarda a inscrição de push deste navegador.
 *
 * `upsert` sobre `(user_id, endpoint)`: reinscrever o mesmo navegador tem de
 * atualizar as chaves, não criar uma segunda linha que produziria duas
 * notificações iguais.
 */
export async function savePushSubscription(
  _prev: AiSettingsActionState,
  formData: FormData,
): Promise<AiSettingsActionState> {
  const parsed = pushSubscriptionSchema.safeParse({
    endpoint: formData.get('endpoint'),
    p256dh: formData.get('p256dh'),
    auth: formData.get('auth'),
    userAgent: formData.get('userAgent') ?? '',
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Inscrição inválida' }
  }

  const userId = await currentUserId()
  const supabase = await createClient()

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.p256dh,
      auth_secret: parsed.data.auth,
      user_agent: parsed.data.userAgent,
    },
    { onConflict: 'user_id,endpoint' },
  )

  if (error) return { error: `Não foi possível ativar os avisos: ${error.message}` }

  revalidatePath('/ajustes/ia')

  return { success: 'Avisos ativados neste aparelho.' }
}

/** Remove a inscrição deste navegador. */
export async function removePushSubscription(
  _prev: AiSettingsActionState,
  formData: FormData,
): Promise<AiSettingsActionState> {
  const endpoint = formData.get('endpoint')
  if (typeof endpoint !== 'string' || endpoint === '') {
    return { error: 'Inscrição inválida' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
    .select('id')

  if (error) return { error: `Não foi possível desativar: ${error.message}` }

  revalidatePath('/ajustes/ia')

  return { success: 'Avisos desativados neste aparelho.' }
}
