import { RuleDetail } from '../../compromissos/rule-detail'

/** Editar renda fixa. v1.0 — 2026-09-27. */

// v1.1 — 27/09/2026: só o nome da tela; o "· Cass" vem do `template` do layout raiz.
export const metadata = { title: 'Renda fixa' }
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
