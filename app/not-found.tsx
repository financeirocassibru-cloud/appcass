import Link from 'next/link'
import { Compass } from 'lucide-react'
import { Button } from '@/components/ui/button'

export const metadata = { title: 'Não encontrado · Finanças' }

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 py-8 text-center">
      <Compass className="size-9 text-[var(--foreground-muted)]" aria-hidden />
      <h1 className="text-xl font-bold tracking-tight">Esta tela não existe</h1>
      <p className="text-sm text-[var(--foreground-muted)]">
        O endereço pode ter mudado, ou o item que você procurava foi excluído.
      </p>
      <Button asChild className="min-h-12 text-base">
        <Link href="/">Voltar ao Início</Link>
      </Button>
    </main>
  )
}
