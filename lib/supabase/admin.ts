import 'server-only'

import { createClient } from '@supabase/supabase-js'
import { supabaseUrl } from './env'

/**
 * Cliente com a chave de serviço, que IGNORA a RLS.
 *
 * Existe por um único motivo: emitir convites via `auth.admin`. Não use para
 * ler ou escrever dado de usuário — para isso existe `lib/supabase/server.ts`,
 * onde a RLS continua valendo.
 *
 * O `import 'server-only'` acima faz o build quebrar se este módulo for
 * alcançado a partir de um Client Component.
 */
export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    throw new Error(
      'Variável de ambiente ausente: SUPABASE_SERVICE_ROLE_KEY. Necessária apenas para emitir convites.',
    )
  }

  return createClient(supabaseUrl(), serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
