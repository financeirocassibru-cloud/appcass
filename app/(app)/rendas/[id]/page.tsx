import { RuleDetail } from '../../compromissos/rule-detail'

/** Editar renda fixa. v1.0 — 2026-09-27. */

export const metadata = { title: 'Renda fixa · Finanças' }
export const dynamic = 'force-dynamic'

export default async function RendaFixaPage({
  params,
}: {
  // Next 16: `params` é assíncrono (invariante 12).
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <RuleDetail id={id} kind="income" />
}
