import { RuleList } from '../compromissos/rule-list'

/**
 * Renda fixa. v1.0 — 2026-09-27.
 *
 * As regras de entrada de `recurring_rules`, separadas das contas fixas. Mesma tabela, mesma
 * lista, outro recorte.
 */

// v1.1 — 27/09/2026: só o nome da tela; o "· Cass" vem do `template` do layout raiz.
export const metadata = { title: 'Renda fixa' }
export const dynamic = 'force-dynamic'

export default function RendasPage() {
  return <RuleList kind="income" />
}
