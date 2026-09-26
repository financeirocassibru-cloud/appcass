import 'server-only'

import { parseModelChain } from './models'

/**
 * Variáveis de ambiente da IA e do push. v1.0 — 2026-09-26.
 *
 * Mesmo padrão de `lib/supabase/env.ts`: ausência vira erro com nome e
 * instrução, não `undefined!` que só explode três camadas adiante como
 * "Invalid API key".
 *
 * `import 'server-only'` no topo por um motivo concreto: `GEMINI_API_KEY` e
 * `VAPID_PRIVATE_KEY` são segredos, e não têm prefixo `NEXT_PUBLIC_`. Se algum
 * dia alguém importar este módulo de um Client Component, o build falha aqui em
 * vez de o segredo ir no bundle. É a mesma proteção que `lib/supabase/admin.ts`
 * usa para a chave de serviço.
 */
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Variável de ambiente ausente: ${name}. Configure-a na Vercel (e em .env.local para rodar local).`,
    )
  }
  return value
}

export function geminiApiKey(): string {
  return required('GEMINI_API_KEY', process.env.GEMINI_API_KEY)
}

/** `true` quando dá para falar com o Gemini — a tela usa isto para não prometer o que não entrega. */
export function isAiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY)
}

/** A cadeia de modelos em vigor, já normalizada. */
export function geminiModelChain(): readonly string[] {
  return parseModelChain(process.env.GEMINI_MODELS)
}

export function vapidPublicKey(): string {
  return required('NEXT_PUBLIC_VAPID_PUBLIC_KEY', process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY)
}

export function vapidPrivateKey(): string {
  return required('VAPID_PRIVATE_KEY', process.env.VAPID_PRIVATE_KEY)
}

/**
 * O `mailto:` que o protocolo Web Push exige para o serviço de push saber com
 * quem falar se a aplicação começar a se comportar mal.
 */
export function vapidSubject(): string {
  return required('VAPID_SUBJECT', process.env.VAPID_SUBJECT)
}

/** `true` quando as três chaves VAPID existem. Sem elas, notificação simplesmente não é oferecida. */
export function isPushConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT,
  )
}

export function cronSecret(): string {
  return required('CRON_SECRET', process.env.CRON_SECRET)
}
