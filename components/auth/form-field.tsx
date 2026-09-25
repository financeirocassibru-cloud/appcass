import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/**
 * Composição de label + campo + dica que o shadcn não fornece pronta.
 *
 * As primitivas (`Input`, `Label`, `Button`) vêm do shadcn; o que mora aqui é o
 * arranjo e as regras do app: altura mínima de 44px para alvo de toque
 * (`docs/DESIGN.md`) e a dica ligada ao campo por `aria-describedby`.
 */
export function FormField({
  label,
  name,
  type = 'text',
  autoComplete,
  required = true,
  defaultValue,
  placeholder,
  className,
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
      <Label htmlFor={id}>{label}</Label>
      <Input
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
        className={cn('min-h-11 text-base', className)}
      />
      {hint ? (
        <p id={hintId} className="text-muted-foreground text-xs">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export function SubmitButton({
  children,
  pending,
  variant = 'default',
}: {
  children: React.ReactNode
  pending: boolean
  variant?: 'default' | 'outline'
}) {
  return (
    <Button type="submit" disabled={pending} variant={variant} className="min-h-11 text-base">
      {pending ? 'Aguarde…' : children}
    </Button>
  )
}

/**
 * Mensagem de resultado de uma Server Action.
 *
 * Usa os tokens de dinheiro de propósito: o verde e o vermelho aqui carregam o
 * mesmo significado de sucesso e falha que carregam no extrato, e não competem
 * com o `--destructive` dos botões de excluir.
 */
export function FormMessage({ error, success }: { error?: string; success?: string }) {
  if (!error && !success) return null
  return (
    <p
      role="status"
      className={cn(
        'rounded-lg px-3 py-2 text-sm',
        error
          ? 'bg-[var(--color-expense-soft)] text-[var(--color-expense)]'
          : 'bg-[var(--color-income-soft)] text-[var(--color-income)]',
      )}
    >
      {error ?? success}
    </p>
  )
}
