'use client'

import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { CreditAccountKind } from '@/lib/finance/credit'
import { CreditAccountForm } from '@/components/finance/credit-account-form'

/** O formulário de cadastro; salvo, vai para a tela da conta. v1.0 — 2026-09-27 (Fase 13). */
export function NewAccount({
  initialKind,
  suggestions,
}: {
  initialKind: CreditAccountKind
  suggestions: readonly string[]
}) {
  const router = useRouter()
  return (
    <CreditAccountForm
      initialKind={initialKind}
      suggestions={suggestions}
      onSaved={(account) => {
        toast.success(account.kind === 'card' ? 'Cartão cadastrado.' : 'Empréstimo cadastrado.')
        router.push(`/cartoes/${account.id}`)
      }}
    />
  )
}
