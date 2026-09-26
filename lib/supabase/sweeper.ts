import 'server-only'

import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/db/types'
import { supabaseUrl } from './env'

/**
 * Cliente da varredura de trabalhos da IA, que IGNORA a RLS. v1.0 — 2026-09-26.
 *
 * Existe separado de `lib/supabase/admin.ts` de propósito. O docblock de lá diz
 * "existe por um único motivo: emitir convites" — alargar aquele escopo em
 * silêncio aposentaria um guarda que já pegou coisa. São dois usos diferentes
 * da mesma chave, e cada um declara o seu.
 *
 * O invariante 4 continua valendo: a `SUPABASE_SERVICE_ROLE_KEY` não sai de
 * `lib/supabase/`, e o `import 'server-only'` quebra o build se este módulo for
 * alcançado de um Client Component.
 *
 * Quem usa: `app/api/ai/sweep/route.ts`, e só ele. O escopo do que a varredura
 * toca está documentado lá.
 */
export function createSweeperClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    throw new Error(
      'Variável de ambiente ausente: SUPABASE_SERVICE_ROLE_KEY. Necessária para a varredura dos trabalhos da IA.',
    )
  }

  return createClient<Database>(supabaseUrl(), serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
