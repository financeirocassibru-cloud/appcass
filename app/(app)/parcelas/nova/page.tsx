import { redirect } from 'next/navigation'

/**
 * v1.1 — 2026-09-27: parcelamento passou a nascer no [+] (modo Parcelado), onde também dá
 * para cadastrar um já em andamento. A rota fica, redirecionando, pelos atalhos antigos.
 */
export default function NovaParcelaPage() {
  redirect('/novo?modo=parcelado')
}
