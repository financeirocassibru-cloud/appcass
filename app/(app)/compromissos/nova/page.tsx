import { redirect } from 'next/navigation'

/**
 * v1.1 — 2026-09-27: conta fixa passou a nascer no [+]. A rota fica, redirecionando, porque
 * está em atalhos e no histórico do navegador de quem já usava.
 */
export default async function NovaContaFixaPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>
}) {
  const { tipo } = await searchParams
  redirect(tipo === 'entrada' ? '/novo?tipo=entrada&modo=fixa' : '/novo?modo=fixa')
}
