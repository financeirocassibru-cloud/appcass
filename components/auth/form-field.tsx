export function FormField({
  label,
  name,
  type = 'text',
  autoComplete,
  required = true,
  defaultValue,
  placeholder,
  className = '',
  hint,
  inputMode,
  min,
  max,
}: {
  label: string
  name: string
  type?: string
  autoComplete?: string
  required?: boolean
  defaultValue?: string | number
  placeholder?: string
  className?: string
  hint?: string
  inputMode?: 'text' | 'numeric' | 'email'
  min?: number
  max?: number
}) {
  const id = `campo-${name}`
  const hintId = hint ? `${id}-dica` : undefined

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
        placeholder={placeholder}
        inputMode={inputMode}
        min={min}
        max={max}
        aria-describedby={hintId}
        className={`min-h-11 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3.5 text-base outline-none focus-visible:border-[var(--brand)] focus-visible:ring-2 focus-visible:ring-[var(--brand)]/25 ${className}`}
      />
      {hint ? (
        <p id={hintId} className="text-xs text-[var(--foreground-muted)]">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export function SubmitButton({
  children,
  pending,
  variant = 'primary',
}: {
  children: React.ReactNode
  pending: boolean
  variant?: 'primary' | 'ghost'
}) {
  const styles =
    variant === 'primary'
      ? 'bg-[var(--brand)] text-[var(--brand-foreground)]'
      : 'border border-[var(--border)] bg-transparent text-[var(--foreground)]'

  return (
    <button
      type="submit"
      disabled={pending}
      className={`min-h-11 rounded-lg px-4 text-base font-semibold transition-opacity disabled:opacity-60 ${styles}`}
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
