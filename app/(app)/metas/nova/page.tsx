import { redirect } from 'next/navigation'

/**
 * v1.1 — 2026-09-27: meta passou a nascer no [+], como Saída › Meta. A rota fica,
 * redirecionando, porque está em atalhos e no histórico do navegador de quem já usava.
 */
export default function NovaMetaPage() {
  redirect('/novo?modo=meta')
}
