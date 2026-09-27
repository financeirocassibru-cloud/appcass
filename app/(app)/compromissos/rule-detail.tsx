import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import type { EntryKind } from '@/lib/db/types'
import { listActiveCategories } from '@/lib/db/queries/categories'
import { listImportedDescriptions } from '@/lib/db/queries/entries'
import { countMaterialized, getRecurringRule } from '@/lib/db/queries/recurring'
import { RecurringForm } from './form'
import { RuleActions } from './[id]/actions'

/**
 * Edição de uma regra, para `/compromissos/[id]` e `/rendas/[id]`.
 *
 * v1.0 — 2026-09-27: extraída de `compromissos/[id]/page.tsx` quando renda fixa ganhou rota
 * própria. Se a regra aberta é do outro tipo — um link antigo de renda em `/compromissos` —,
 * redireciona para a rota certa, em vez de mostrar o salário sob o título "Contas fixas".
 *
 * v1.1 — 2026-09-27: carrega as descrições importadas, que sugerem as palavras-chave.
 */
export async function RuleDetail({ id, kind }: { id: string; kind: EntryKind }) {
  const rule = await getRecurringRule(id)
  if (!rule) notFound()

  if (rule.kind !== kind) {
    redirect(rule.kind === 'income' ? `/rendas/${rule.id}` : `/compromissos/${rule.id}`)
  }

  const [categories, materializedCount, imported] = await Promise.all([
    listActiveCategories(rule.kind),
    countMaterialized(rule.id),
    listImportedDescriptions(),
  ])

  const isIncome = rule.kind === 'income'

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
      <div className="flex flex-col gap-2">
        <Link
          href={isIncome ? '/rendas' : '/compromissos'}
          className="text-muted-foreground flex min-h-11 items-center gap-1 text-sm"
        >
          <ChevronLeft className="size-4" aria-hidden />
          {isIncome ? 'Renda fixa' : 'Contas fixas'}
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">
          {isIncome ? 'Editar renda fixa' : 'Editar conta fixa'}
        </h1>
      </div>

      <RecurringForm categories={categories} rule={rule} suggestions={imported[rule.kind]} />

      <RuleActions
        id={rule.id}
        kind={rule.kind}
        isActive={rule.isActive}
        materializedCount={materializedCount}
      />
    </main>
  )
}
