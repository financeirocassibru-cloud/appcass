import { isAiConfigured, isPushConfigured } from '@/lib/ai/env'
import { DEFAULT_MODEL_CHAIN } from '@/lib/ai/models'
import { createClient } from '@/lib/supabase/server'
import { AiSettingsForm } from './form'

export const metadata = { title: 'IA · Finanças' }
export const dynamic = 'force-dynamic'

/**
 * Ajustes do assistente. v1.0 — 2026-09-26.
 *
 * A chave pública VAPID desce como prop em vez de ser lida no componente
 * cliente: ela é `NEXT_PUBLIC_` e poderia ser lida lá, mas toda leitura de
 * ambiente do app passa por um módulo `server-only` que erra alto quando falta a
 * variável. Manter o caminho único evita um `undefined` silencioso virando uma
 * inscrição de push inválida.
 */
export default async function AjustesIaPage() {
  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('ai_insights_enabled, ai_notifications_enabled, ai_model')
    .maybeSingle()

  return (
    <AiSettingsForm
      insightsEnabled={profile?.ai_insights_enabled ?? true}
      notificationsEnabled={profile?.ai_notifications_enabled ?? true}
      model={profile?.ai_model ?? ''}
      models={[...DEFAULT_MODEL_CHAIN]}
      aiConfigured={isAiConfigured()}
      pushConfigured={isPushConfigured()}
      vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''}
    />
  )
}
