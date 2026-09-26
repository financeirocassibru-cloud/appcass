import { CarregandoTela, GraficoSkeleton, HeroiSkeleton, ListaSkeleton } from '@/components/app/skeletons'

/**
 * Esqueleto do Início — a tela mais pesada, porque busca saldo, agenda e dois
 * gráficos em paralelo.
 *
 * Como `loading.tsx` na raiz do grupo `(app)`, ele também cobre as rotas que
 * não têm um esqueleto próprio.
 */
export default function Loading() {
  return (
    <CarregandoTela>
      <HeroiSkeleton />
      <ListaSkeleton linhas={3} />
      <GraficoSkeleton altura="h-32" />
    </CarregandoTela>
  )
}
