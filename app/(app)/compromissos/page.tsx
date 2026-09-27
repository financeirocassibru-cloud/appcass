import { RuleList } from './rule-list'

/**
 * Contas fixas. v1.1 — 2026-09-27.
 *
 * v1.1: só as de saída. Renda fixa ganhou lista própria em `/rendas`, e a tela inteira virou
 * `RuleList`, que as duas compartilham.
 */

// v1.2 — 27/09/2026: só o nome da tela; o "· Cass" vem do `template` do layout raiz.
export const metadata = { title: 'Contas fixas' }
/** Lê o banco e calcula o próximo vencimento a partir de hoje. */
export const dynamic = 'force-dynamic'

export default function CompromissosPage() {
  return <RuleList kind="expense" />
}
