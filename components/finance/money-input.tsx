'use client'

import { useId, useState } from 'react'
import {
  centsFromInitial,
  formatCents,
  parseCents,
  popCentsDigit,
  pushCentsDigit,
} from '@/lib/finance/money'
import { cn } from '@/lib/utils'

/**
 * Campo de valor no estilo de app de banco.
 *
 * O estado **é** o número de centavos, não texto. Digitar `1`, `2`, `3`, `4` leva
 * a 1234 e mostra `R$ 12,34` — a vírgula anda da direita para a esquerda sozinha.
 * Não existe ponto no fluxo em que o valor seja `parseFloat` de uma string, que é
 * como o app antigo perdia centavos.
 *
 * O valor vai para a Server Action num `input hidden` já em centavos, então o
 * servidor recebe o inteiro e não precisa reinterpretar nada.
 */
export function MoneyInput({
  name = 'amountCents',
  initialCents,
  label,
  autoFocus = false,
}: {
  name?: string
  initialCents?: number
  label: string
  autoFocus?: boolean
}) {
  const [cents, setCents] = useState(() => centsFromInitial(initialCents))
  const id = useId()

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace') {
      event.preventDefault()
      setCents(popCentsDigit)
      return
    }
    if (/^[0-9]$/.test(event.key)) {
      event.preventDefault()
      setCents((current) => pushCentsDigit(current, event.key))
      return
    }
    // Deixa passar navegação e atalhos; barra o resto para o campo nunca conter
    // algo que não seja dígito.
    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
      event.preventDefault()
    }
  }

  function handlePaste(event: React.ClipboardEvent<HTMLInputElement>) {
    event.preventDefault()
    // Colar aceita as formas que aparecem numa mensagem: "12,34", "R$ 12,34".
    const parsed = parseCents(event.clipboardData.getData('text'))
    if (parsed !== null && parsed > 0) setCents(parsed)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-muted-foreground text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        // `text` e não `number`: `number` traria as setas de incremento e
        // aceitaria notação científica. O teclado numérico vem do inputMode.
        type="text"
        inputMode="numeric"
        autoComplete="off"
        // O valor exibido é sempre derivado do estado, então o campo não tem
        // estado textual próprio para divergir.
        value={formatCents(cents)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        // `onChange` existe só para o React não reclamar de campo controlado sem
        // handler; a mudança real acontece em onKeyDown.
        onChange={() => undefined}
        autoFocus={autoFocus}
        aria-describedby={`${id}-dica`}
        className={cn(
          'tabular border-input bg-card focus-visible:border-primary focus-visible:ring-ring/25',
          'min-h-16 rounded-xl border px-4 text-3xl font-bold outline-none focus-visible:ring-2',
          cents === 0 && 'text-muted-foreground',
        )}
      />
      <p id={`${id}-dica`} className="text-muted-foreground text-xs">
        Digite os centavos — 1234 vira R$ 12,34.
      </p>
      <input type="hidden" name={name} value={cents} />
    </div>
  )
}
