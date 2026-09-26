import 'server-only'

import webpush from 'web-push'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/db/types'
import { isPushConfigured, vapidPrivateKey, vapidPublicKey, vapidSubject } from './env'

/**
 * Notificação quando o trabalho da IA termina. v1.0 — 2026-09-26.
 *
 * Web Push sobre o service worker que a fase 6b já deixou registrado. É o que
 * permite avisar **com o app fechado** — que é o ponto: se só funcionasse com a
 * aba aberta, um toast bastaria e nada disto precisaria existir.
 *
 * O envio **nunca** derruba o trabalho. Terminar a interpretação e não conseguir
 * avisar é um aborrecimento; deixar o resultado sem gravar porque o serviço de
 * push do fabricante está fora do ar seria perder o trabalho de verdade.
 */

type Client = SupabaseClient<Database>

let configured = false

function ensureConfigured(): void {
  if (configured) return
  webpush.setVapidDetails(vapidSubject(), vapidPublicKey(), vapidPrivateKey())
  configured = true
}

/** O que o service worker recebe e transforma em notificação. */
export interface PushPayload {
  title: string
  body: string
  url: string
}

/**
 * Status que significam "esta inscrição morreu".
 *
 * 404 e 410 são a resposta do serviço de push para uma inscrição que o
 * navegador descartou — desinstalaram o PWA, limparam os dados do site. Guardar
 * a linha adiante só produziria uma falha por notificação, para sempre.
 */
const GONE = new Set([404, 410])

/**
 * Manda a notificação para todos os aparelhos da pessoa.
 *
 * Um aparelho que falha não impede os outros: cada envio é independente, e o
 * resultado de um não diz nada sobre o outro.
 */
export async function sendPush(
  supabase: Client,
  userId: string,
  payload: PushPayload,
): Promise<void> {
  if (!isPushConfigured()) return

  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth_secret')
    .eq('user_id', userId)

  if (error || !subscriptions || subscriptions.length === 0) return

  ensureConfigured()
  const body = JSON.stringify(payload)
  const mortas: string[] = []

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_secret } },
          body,
        )
      } catch (cause) {
        const status = (cause as { statusCode?: number }).statusCode
        if (status !== undefined && GONE.has(status)) mortas.push(sub.id)
      }
    }),
  )

  if (mortas.length > 0) {
    // `.in()` é o filtro que o PostgREST exige para aceitar o DELETE; a RLS é
    // quem autoriza as linhas (invariante 3).
    await supabase.from('push_subscriptions').delete().in('id', mortas).select('id')
  }
}

/**
 * Avisa que um trabalho terminou, se a pessoa quiser ser avisada.
 *
 * A preferência é lida aqui, e não em quem chama, para não haver um caminho que
 * esqueça de consultá-la.
 */
export async function notifyJobFinished(
  supabase: Client,
  userId: string,
  message: string,
): Promise<void> {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('ai_notifications_enabled')
      .eq('id', userId)
      .maybeSingle()

    if (!profile?.ai_notifications_enabled) return

    await sendPush(supabase, userId, {
      title: 'Assistente',
      body: message,
      url: '/assistente',
    })
  } catch {
    // Ver o docblock do módulo: avisar é acessório, gravar o resultado não é.
  }
}
