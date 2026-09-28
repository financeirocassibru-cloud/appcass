import { CarregandoTela, GraficoSkeleton, ListaSkeleton } from '@/components/app/skeletons'
import { Skeleton } from '@/components/ui/skeleton'

// v1.1 — 28/09/2026: largura de painel no computador, a da Análise.
export default function Loading() {
  return (
    <CarregandoTela largura="painel">
      <Skeleton className="h-8 w-32" aria-hidden />
      <Skeleton className="h-11 w-full" aria-hidden />
      <GraficoSkeleton />
      <ListaSkeleton linhas={3} />
    </CarregandoTela>
  )
}
