import { RuleList } from '../compromissos/rule-list'

/**
 * Renda fixa. v1.0 — 2026-09-27.
 *
 * As regras de entrada de `recurring_rules`, separadas das contas fixas. Mesma tabela, mesma
 * lista, outro recorte.
 */

export const metadata = { title: 'Renda fixa · Finanças' }
export const dynamic = 'force-dynamic'

export default function RendasPage() {
  return <RuleList kind="income" />
}
