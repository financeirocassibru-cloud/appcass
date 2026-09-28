import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { listImportedDescriptions } from '@/lib/db/queries/entries'
import { NewAccount } from './new-account'

/** Cadastrar cartão ou empréstimo — v1.0 — 2026-09-27 (Fase 13). `?tipo=emprestimo` já escolhe. */

export const metadata = { title: 'Novo cartão ou empréstimo' }
export const dynamic = 'force-dynamic'

// v1.1 — 28/09/2026: layout de computador — a partir de `lg` (1024 px) a largura vai a `lg:max-w-2xl` (formulário). No celular continua `max-w-md`.
export default async function NovoCartaoPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>
}) {
  const [{ tipo }, imported] = await Promise.all([searchParams, listImportedDescriptions()])

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8 lg:max-w-2xl lg:px-10 lg:py-10">
      <div className="flex flex-col gap-2">
        <Link href="/cartoes" className="text-muted-foreground flex min-h-11 items-center gap-1 text-sm">
          <ChevronLeft className="size-4" aria-hidden />
          Cartões e empréstimos
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Novo</h1>
      </div>
      <NewAccount initialKind={tipo === 'emprestimo' ? 'loan' : 'card'} suggestions={imported.expense} />
    </main>
  )
}
