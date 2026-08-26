import { createBrowserClient } from '@supabase/ssr'
import { supabasePublishableKey, supabaseUrl } from './env'

/** Cliente para Client Components. Só lê; toda escrita passa por Server Action. */
export function createClient() {
  return createBrowserClient(supabaseUrl(), supabasePublishableKey())
}
