import { CarregandoTela, GraficoSkeleton, HeroiSkeleton, ListaSkeleton } from '@/components/app/skeletons'

/**
 * Esqueleto do Início — a tela mais pesada, porque busca saldo, agenda e dois
 * gráficos em paralelo.
 *
 * Como `loading.tsx` na raiz do grupo `(app)`, ele também cobre as rotas que
 * não têm um esqueleto próprio.
 *
 * v1.1 — 28/09/2026: largura de painel no computador, a do Início.
 */
export default function Loading() {
  return (
    <CarregandoTela largura="painel">
      <HeroiSkeleton />
      <ListaSkeleton linhas={3} />
      <GraficoSkeleton altura="h-32" />
    </CarregandoTela>
  )
}
