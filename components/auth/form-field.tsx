export function FormField({
  label,
  name,
  type = 'text',
  autoComplete,
  required = true,
  defaultValue,
}: {
  label: string
  name: string
  type?: string
  autoComplete?: string
  required?: boolean
  defaultValue?: string
}) {
  const id = `campo-${name}`
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        defaultValue={defaultValue}
        className="min-h-11 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3.5 text-base outline-none focus-visible:border-[var(--brand)] focus-visible:ring-2 focus-visible:ring-[var(--brand)]/25"
      />
    </div>
  )
}

export function SubmitButton({ children, pending }: { children: React.ReactNode; pending: boolean }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-11 rounded-lg bg-[var(--brand)] px-4 text-base font-semibold text-[var(--brand-foreground)] transition-opacity disabled:opacity-60"
    >
      {pending ? 'Aguarde…' : children}
    </button>
  )
}

export function FormMessage({ error, success }: { error?: string; success?: string }) {
  if (!error && !success) return null
  return (
    <p
      role="status"
      className={`rounded-lg px-3 py-2 text-sm ${
        error
          ? 'bg-[var(--color-expense-soft)] text-[var(--color-expense)]'
          : 'bg-[var(--color-income-soft)] text-[var(--color-income)]'
      }`}
    >
      {error ?? success}
    </p>
  )
}
