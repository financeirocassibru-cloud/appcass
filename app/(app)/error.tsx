'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Error boundary das telas do app.
 *
 * Duas decisões:
 *
 * **Não mostra `error.message`.** As mensagens vêm de falhas de consulta e
 * podem conter nome de tabela, coluna ou id — detalhe de infraestrutura que não
 * ajuda quem está olhando e que não deveria vazar para a tela. O `digest` é o
 * que liga esta tela ao registro do servidor, e esse sim aparece.
 *
 * **Oferece um caminho, não só um botão.** "Tentar de novo" resolve a falha
 * passageira; quando não resolve, voltar ao Início é melhor que ficar preso.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // O servidor já registrou com o mesmo digest; isto liga os dois lados
    // quando o problema acontece no cliente.
    console.error('Falha na tela:', error.digest ?? error.message)
  }, [error])

  return (
    <main className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center gap-4 px-6 py-8 text-center">
      <TriangleAlert className="size-9 text-[var(--expense)]" aria-hidden />
      <h1 className="text-xl font-bold tracking-tight">Algo deu errado aqui</h1>
      <p className="text-sm text-[var(--foreground-muted)]">
        Não foi possível carregar esta tela. Seus dados estão salvos — o problema foi em mostrá-los.
      </p>

      <div className="flex w-full flex-col gap-2 pt-2">
        <Button onClick={reset} className="min-h-12 text-base">
          Tentar de novo
        </Button>
        <Button asChild variant="outline" className="min-h-12 text-base">
          <Link href="/">Voltar ao Início</Link>
        </Button>
      </div>

      {error.digest ? (
        <p className="text-xs text-[var(--foreground-muted)]">
          Código do erro: <code className="bg-muted rounded px-1.5 py-0.5">{error.digest}</code>
        </p>
      ) : null}
    </main>
  )
}
