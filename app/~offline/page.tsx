import { WifiOff } from 'lucide-react'

export const metadata = { title: 'Sem conexão · Finanças' }

/**
 * Página servida quando uma navegação falha e não há versão em cache.
 *
 * Precisa ser estática: é o último recurso, e depender do banco aqui seria
 * pedir rede para explicar que não há rede.
 */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 py-8 text-center">
      <WifiOff className="size-10 text-[var(--foreground-muted)]" aria-hidden />
      <h1 className="text-xl font-bold tracking-tight">Sem conexão</h1>
      <p className="text-sm text-[var(--foreground-muted)]">
        Esta tela ainda não tinha sido aberta neste aparelho, então não há uma versão guardada
        para mostrar. As telas que você já visitou continuam disponíveis.
      </p>
      <p className="text-xs text-[var(--foreground-muted)]">
        Lançar, editar e marcar como pago precisam de rede — um app de dinheiro que sincroniza
        errado é pior que um que avisa.
      </p>
    </main>
  )
}
