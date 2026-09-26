import { CarregandoTela, ListaSkeleton } from '@/components/app/skeletons'
import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <CarregandoTela>
      <Skeleton className="h-8 w-40" aria-hidden />
      <Skeleton className="h-24 w-full rounded-xl" aria-hidden />
      <ListaSkeleton linhas={3} />
    </CarregandoTela>
  )
}
