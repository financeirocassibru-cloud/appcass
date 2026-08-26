import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { InviteForm } from './invite-form'

export const metadata = { title: 'Convites · Finanças' }

interface InviteRow {
  id: string
  email: string
  status: 'pending' | 'accepted' | 'revoked'
  created_at: string
}

const STATUS_LABEL: Record<InviteRow['status'], string> = {
  pending: 'Aguardando',
  accepted: 'Aceito',
  revoked: 'Revogado',
}

export default async function ConvitesPage() {
  const supabase = await createClient()

  const { data: isAdmin } = await supabase.rpc('is_admin')
  if (!isAdmin) redirect('/')

  // A RLS já limita esta leitura a admin; o redirect acima existe só para dar
  // uma resposta melhor que uma lista vazia.
  const { data } = await supabase
    .from('invites')
    .select('id, email, status, created_at')
    .order('created_at', { ascending: false })

  const invites = (data ?? []) as InviteRow[]

  return (
    <section className="mx-auto flex max-w-md flex-col gap-8 px-6 py-10">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Convites</h1>
        <p className="mt-1 text-sm text-[var(--foreground-muted)]">
          O cadastro público está desligado. Quem entra, entra por convite.
        </p>
      </header>

      <InviteForm />

      {invites.length === 0 ? (
        <p className="text-sm text-[var(--foreground-muted)]">Nenhum convite enviado ainda.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--border)]">
          {invites.map((invite) => (
            <li key={invite.id} className="flex items-center justify-between gap-3 py-3">
              <span className="truncate text-sm">{invite.email}</span>
              <span className="shrink-0 rounded-full bg-[var(--surface)] px-2.5 py-1 text-xs text-[var(--foreground-muted)]">
                {STATUS_LABEL[invite.status]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
