import { CarregandoTela, GraficoSkeleton, ListaSkeleton } from '@/components/app/skeletons'
import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <CarregandoTela>
      <Skeleton className="h-8 w-32" aria-hidden />
      <Skeleton className="h-11 w-full" aria-hidden />
      <GraficoSkeleton />
      <ListaSkeleton linhas={3} />
    </CarregandoTela>
  )
}
