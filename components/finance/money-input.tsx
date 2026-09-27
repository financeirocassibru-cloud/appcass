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
 * Campo de valor no estilo de app de banco. v1.2 — 2026-09-27.
 *
 * v1.1: ganhou `compact`, para caber num cartão de ajuste na tela de confirmação do
 * assistente. É uma variante de tamanho e nada mais — a lógica de dígitos, que é a parte
 * que o invariante 1 protege, continua sendo esta e só esta. Um segundo campo de dinheiro
 * escrito à parte seria a ocasião perfeita para alguém reintroduzir um `parseFloat`.
 *
 * O estado **é** o número de centavos, não texto. Digitar `1`, `2`, `3`, `4` leva
 * a 1234 e mostra `R$ 12,34` — a vírgula anda da direita para a esquerda sozinha.
 * Não existe ponto no fluxo em que o valor seja `parseFloat` de uma string, que é
 * como o app antigo perdia centavos.
 *
 * O valor vai para a Server Action num `input hidden` já em centavos, então o
 * servidor recebe o inteiro e não precisa reinterpretar nada.
 *
 * v1.2 — 2026-09-27: `onCentsChange`, para o formulário do [+] mostrar a prévia do
 * parcelamento enquanto a pessoa digita; e `name={null}`, para quando o valor enviado não é o
 * digitado (no parcelamento por "valor da parcela", vai o total). Continua sendo o único campo
 * de dinheiro do app.
 */
export function MoneyInput({
  name = 'amountCents',
  initialCents,
  label,
  autoFocus = false,
  compact = false,
  onCentsChange,
}: {
  /** `null`: sem `input hidden` — quem usa envia o valor por conta própria. */
  name?: string | null
  initialCents?: number
  label: string
  autoFocus?: boolean
  /** Versão miúda, para cartão de ajuste. Muda só o tamanho. */
  compact?: boolean
  /** Chamado a cada mudança, com o novo valor em centavos. */
  onCentsChange?: (cents: number) => void
}) {
  const [cents, setCentsState] = useState(() => centsFromInitial(initialCents))
  const id = useId()

  function setCents(next: number) {
    setCentsState(next)
    onCentsChange?.(next)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace') {
      event.preventDefault()
      setCents(popCentsDigit(cents))
      return
    }
    if (/^[0-9]$/.test(event.key)) {
      event.preventDefault()
      setCents(pushCentsDigit(cents, event.key))
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
        aria-describedby={compact ? undefined : `${id}-dica`}
        className={cn(
          'tabular border-input bg-card focus-visible:border-primary focus-visible:ring-ring/25',
          'rounded-xl border outline-none focus-visible:ring-2',
          compact ? 'min-h-11 px-3 text-base font-semibold' : 'min-h-16 px-4 text-3xl font-bold',
          cents === 0 && 'text-muted-foreground',
        )}
      />
      {!compact && (
        <p id={`${id}-dica`} className="text-muted-foreground text-xs">
          Digite os centavos — 1234 vira R$ 12,34.
        </p>
      )}
      {name === null ? null : <input type="hidden" name={name} value={cents} />}
    </div>
  )
}
