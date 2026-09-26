'use client'

import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { EntryForm } from '@/components/finance/entry-form'
import type { Category } from '@/lib/db/queries/categories'

/**
 * O lançamento rápido, que é o `EntryForm` mais o destino depois de salvar.
 *
 * v1.0 — 2026-09-26: o formulário mudou de casa para `components/finance/entry-form.tsx`, onde
 * o Histórico e a tela cheia da Análise também o usam. O que sobrou aqui é justamente o que era
 * específico desta tela e estava escrito dentro dele: navegar para o Histórico ao terminar.
 */
export function QuickEntry({
  expenseCategories,
  incomeCategories,
  today,
}: {
  expenseCategories: Category[]
  incomeCategories: Category[]
  today: string
}) {
  const router = useRouter()

  return (
    <EntryForm
      mode="create"
      expenseCategories={expenseCategories}
      incomeCategories={incomeCategories}
      today={today}
      onDone={() => {
        toast.success('Lançamento salvo.')
        router.push('/historico')
      }}
    />
  )
}
