import { RuleDetail } from '../rule-detail'

/**
 * Editar conta fixa. v1.1 — 2026-09-27.
 *
 * v1.1: o conteúdo mudou para `RuleDetail`, compartilhado com `/rendas/[id]`.
 */

// v1.2 — 27/09/2026: só o nome da tela; o "· Cass" vem do `template` do layout raiz.
export const metadata = { title: 'Conta fixa' }
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
