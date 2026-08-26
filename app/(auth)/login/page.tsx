import Link from 'next/link'
import { LoginForm } from './login-form'

export const metadata = { title: 'Entrar · Finanças' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ proxima?: string }>
}) {
  const { proxima } = await searchParams

  return (
    <>
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Finanças</h1>
        <p className="mt-1 text-sm text-[var(--foreground-muted)]">Entre na sua conta.</p>
      </header>
      <LoginForm proxima={proxima} />
      <p className="mt-6 text-center text-sm text-[var(--foreground-muted)]">
        Tem um código de convite?{' '}
        <Link href="/entrar" className="font-medium text-[var(--brand)] underline-offset-4 hover:underline">
          Criar conta
        </Link>
      </p>
    </>
  )
}
