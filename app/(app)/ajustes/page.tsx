import { createClient } from '@/lib/supabase/server'
import { LogoutButton } from './logout-button'

// v1.1 — 27/09/2026: só o nome da tela; o "· Cass" vem do `template` do layout raiz.
export const metadata = { title: 'Ajustes' }

export default async function PerfilPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const email = typeof data?.claims?.email === 'string' ? data.claims.email : '—'

  return (
    <div className="flex flex-col gap-6">
      <dl className="flex flex-col gap-1">
        <dt className="text-sm text-[var(--foreground-muted)]">Conta</dt>
        <dd className="text-base font-medium">{email}</dd>
      </dl>
      <LogoutButton />
    </div>
  )
}
