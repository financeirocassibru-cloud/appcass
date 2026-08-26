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
        <p className="mt-1 text-sm text-[var(--foreground-muted)]">
          Entre com o e-mail que recebeu o convite.
        </p>
      </header>
      <LoginForm proxima={proxima} />
    </>
  )
}
