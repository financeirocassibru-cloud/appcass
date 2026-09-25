import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/lib/db/types'
import { supabasePublishableKey, supabaseUrl } from './env'

/** Cliente para Client Components. Só lê; toda escrita passa por Server Action. */
export function createClient() {
  return createBrowserClient<Database>(supabaseUrl(), supabasePublishableKey())
}
