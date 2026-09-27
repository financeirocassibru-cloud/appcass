import { CarregandoTela, ListaSkeleton } from '@/components/app/skeletons'
import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <CarregandoTela>
      <Skeleton className="h-8 w-40" aria-hidden />
      <Skeleton className="h-11 w-full" aria-hidden />
      <ListaSkeleton linhas={6} />
    </CarregandoTela>
  )
}
