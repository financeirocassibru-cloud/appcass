import { RuleDetail } from '../rule-detail'

/**
 * Editar conta fixa. v1.1 — 2026-09-27.
 *
 * v1.1: o conteúdo mudou para `RuleDetail`, compartilhado com `/rendas/[id]`.
 */

export const metadata = { title: 'Conta fixa · Finanças' }
export const dynamic = 'force-dynamic'

export default async function ContaFixaPage({
  params,
}: {
  // Next 16: `params` é assíncrono (invariante 12).
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <RuleDetail id={id} kind="expense" />
}
