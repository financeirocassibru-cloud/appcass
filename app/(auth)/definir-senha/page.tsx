import { SetPasswordForm } from './set-password-form'

export const metadata = { title: 'Definir senha · Finanças' }

export default function SetPasswordPage() {
  return (
    <>
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Defina sua senha</h1>
        <p className="mt-1 text-sm text-[var(--foreground-muted)]">
          Pelo menos 8 caracteres.
        </p>
      </header>
      <SetPasswordForm />
    </>
  )
}
