'use client'

import { useSyncExternalStore } from 'react'
import Link from 'next/link'
import { Eye, EyeOff } from 'lucide-react'
import { formatCents } from '@/lib/finance/money'
import { cn } from '@/lib/utils'

/**
 * O número que a pessoa abre o app para ver.
 *
 * O olho oculta valores para consultar o saldo em público — pedido de
 * `docs/DESIGN.md`. O estado é conveniência **por dispositivo**, então mora em
 * `localStorage` e não no banco: esconder no celular não deve esconder no
 * computador.
 *
 * O padrão é **visível**. Um app que abre escondendo o saldo cobra um toque a
 * mais de todo uso para proteger o caso raro.
 */

const STORAGE_KEY = 'appcass:hide-amounts'

/**
 * A preferência é lida por `useSyncExternalStore`, e não por `useState` mais
 * efeito.
 *
 * O motivo é o servidor: ele não tem `localStorage`, então o primeiro HTML tem de
 * sair com o padrão. Corrigir isso num efeito significa `setState` durante a
 * montagem — uma renderização em cascata, que o lint do React reprova com razão.
 * `useSyncExternalStore` é a forma prevista para isto: `getServerSnapshot` dá o
 * padrão para o HTML, `getSnapshot` lê o valor real no cliente, e o React
 * reconcilia os dois sem aviso de hidratação.
 *
 * De brinde, escutar `storage` mantém duas abas do mesmo navegador de acordo.
 */

const listeners = new Set<() => void>()

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange)
  window.addEventListener('storage', onStoreChange)
  return () => {
    listeners.delete(onStoreChange)
    window.removeEventListener('storage', onStoreChange)
  }
}

/**
 * Leitura e escrita protegidas por `try/catch`: em aba privada o acesso pode
 * lançar, e a tela tem de renderizar de qualquer forma.
 */
function getSnapshot(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

/** O padrão é **visível**: um app que abre escondendo o saldo cobra um toque a
 *  mais de todo uso para proteger o caso raro. */
function getServerSnapshot(): boolean {
  return false
}

function setHidden(hidden: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, hidden ? '1' : '0')
  } catch {
    // Sem persistência a preferência vale só nesta visita, e isso é aceitável —
    // mas os ouvintes ainda precisam ser avisados para a tela reagir ao toque.
  }
  for (const listener of listeners) listener()
}

export function BalanceHero({
  cents,
  anchorOn,
  isAnchorConfigured,
  incomeCents,
  expenseCents,
}: {
  cents: number
  anchorOn: string
  isAnchorConfigured: boolean
  incomeCents: number
  expenseCents: number
}) {
  const hidden = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const mask = '•••••'

  return (
    <section
      aria-labelledby="titulo-saldo"
      className="flex flex-col gap-3 rounded-2xl bg-[var(--surface)] p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="titulo-saldo" className="text-sm font-medium text-[var(--foreground-muted)]">
          Saldo atual
        </h2>
        <button
          type="button"
          onClick={() => setHidden(!hidden)}
          aria-pressed={hidden}
          aria-label={hidden ? 'Mostrar valores' : 'Ocultar valores'}
          className="text-muted-foreground hover:text-foreground flex size-11 items-center justify-center rounded-full transition-colors"
        >
          {hidden ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
        </button>
      </div>

      {/* Cor semântica pelo sinal, como manda `docs/DESIGN.md`: verde positivo,
          vermelho negativo. A mesma regra de `Balance`, reescrita aqui porque o
          herói precisa mascarar o texto. */}
      {/* Sem `tabular` de propósito: a skill `dataviz` reserva dígitos de largura
          fixa para colunas que precisam alinhar. Num número grande e solto eles
          deixam o valor visivelmente frouxo. */}
      <p
        className={cn(
          'text-4xl font-bold',
          cents < 0 ? 'text-[var(--expense)]' : 'text-[var(--income)]',
        )}
      >
        {hidden ? mask : formatCents(cents)}
      </p>

      <dl className="grid grid-cols-2 gap-3 pt-1">
        <div>
          <dt className="text-xs text-[var(--foreground-muted)]">Entrou</dt>
          <dd className="tabular text-sm font-semibold text-[var(--income)]">
            {hidden ? mask : formatCents(incomeCents)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--foreground-muted)]">Saiu</dt>
          <dd className="tabular text-sm font-semibold text-[var(--expense)]">
            {hidden ? mask : formatCents(expenseCents)}
          </dd>
        </div>
      </dl>

      {/* A âncora fica à vista sempre: é a premissa do número acima, e o app
          antigo errava por guardar um saldo solto que ninguém sabia de quando
          era. Sem âncora informada, o texto convida a informá-la em vez de
          apresentar o número como certo. */}
      <p className="text-xs text-[var(--foreground-muted)]">
        {isAnchorConfigured ? (
          <>
            A partir do saldo informado em {formatAnchorDate(anchorOn)}.{' '}
            <Link href="/ajustes/saldo" className="text-[var(--brand)] underline">
              Ajustar
            </Link>
          </>
        ) : (
          <>
            Você ainda não informou quanto tem.{' '}
            <Link href="/ajustes/saldo" className="text-[var(--brand)] underline">
              Informar agora
            </Link>{' '}
            para o saldo ficar certo.
          </>
        )}
      </p>
    </section>
  )
}

/**
 * `dd/mm/aaaa` a partir da string, sem passar por `Date` no fuso local — que é
 * exatamente como o app antigo deslocava o dia.
 */
function formatAnchorDate(date: string): string {
  const [year, month, day] = date.split('-')
  return `${day}/${month}/${year}`
}
