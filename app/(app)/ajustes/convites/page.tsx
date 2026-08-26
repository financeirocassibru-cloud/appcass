import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CreateInviteForm, RevokeInviteButton } from './forms'

export const metadata = { title: 'Convites · Finanças' }

export const dynamic = 'force-dynamic'

interface InviteRow {
  id: string
  label: string | null
  status: 'pending' | 'accepted' | 'revoked'
  expires_at: string
  created_at: string
  accepted_at: string | null
}

const DATE_FORMAT = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' })

function describeStatus(invite: InviteRow): { text: string; tone: 'neutral' | 'good' | 'bad' } {
  if (invite.status === 'accepted') return { text: 'Usado', tone: 'good' }
  if (invite.status === 'revoked') return { text: 'Revogado', tone: 'bad' }
  if (new Date(invite.expires_at) <= new Date()) return { text: 'Expirado', tone: 'bad' }
  return { text: `Vale até ${DATE_FORMAT.format(new Date(invite.expires_at))}`, tone: 'neutral' }
}

export default async function ConvitesPage() {
  const supabase = await createClient()

  const { data: isAdmin } = await supabase.rpc('is_admin')
  if (isAdmin !== true) redirect('/ajustes')

  // A RLS já limita esta leitura a admin; o redirect acima existe só para dar
  // uma resposta melhor que uma lista vazia.
  const { data } = await supabase
    .from('invites')
    .select('id, label, status, expires_at, created_at, accepted_at')
    .order('created_at', { ascending: false })

  const invites = (data ?? []) as InviteRow[]

  return (
    <div className="flex flex-col gap-8">
      <p className="text-sm text-[var(--foreground-muted)]">
        O cadastro público está desligado e nenhum e-mail é enviado. Gere um código aqui e
        repasse para a pessoa — ela usa em <strong>/entrar</strong> para criar a conta.
      </p>

      <CreateInviteForm />

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Convites gerados</h2>

        {invites.length === 0 ? (
          <p className="text-sm text-[var(--foreground-muted)]">Nenhum convite ainda.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--border)]">
            {invites.map((invite) => {
              const status = describeStatus(invite)
              const revocable =
                invite.status === 'pending' && new Date(invite.expires_at) > new Date()

              return (
                <li key={invite.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {invite.label ?? 'Sem rótulo'}
                    </p>
                    <p
                      className={`text-xs ${
                        status.tone === 'good'
                          ? 'text-[var(--income)]'
                          : status.tone === 'bad'
                            ? 'text-[var(--expense)]'
                            : 'text-[var(--foreground-muted)]'
                      }`}
                    >
                      {status.text}
                    </p>
                  </div>
                  {revocable ? <RevokeInviteButton id={invite.id} /> : null}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
