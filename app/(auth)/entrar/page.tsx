import Link from 'next/link'
import { isSystemEmpty } from '@/lib/actions/auth'
import { FirstAccountForm, RedeemForm } from './forms'

export const metadata = { title: 'Criar conta · Finanças' }

// A porta de bootstrap depende do estado do banco; não pode ser pré-renderizada.
export const dynamic = 'force-dynamic'

export default async function EntrarPage() {
  const empty = await isSystemEmpty()

  if (empty) {
    return (
      <>
        <header className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Primeira conta</h1>
          <p className="mt-1 text-sm text-[var(--foreground-muted)]">
            Ainda não existe nenhuma conta. Esta primeira será a de administrador, e a
            partir dela os convites são gerados.
          </p>
        </header>
        <FirstAccountForm />
      </>
    )
  }

  return (
    <>
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Criar conta</h1>
        <p className="mt-1 text-sm text-[var(--foreground-muted)]">
          Use o código que o administrador te passou.
        </p>
      </header>
      <RedeemForm />
      <p className="mt-6 text-center text-sm text-[var(--foreground-muted)]">
        Já tem conta?{' '}
        <Link href="/login" className="font-medium text-[var(--brand)] underline-offset-4 hover:underline">
          Entrar
        </Link>
      </p>
    </>
  )
}
