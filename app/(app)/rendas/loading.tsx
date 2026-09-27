// v1.0 — 2026-09-27: o mesmo esqueleto da lista de contas fixas.
import { CarregandoTela, ListaSkeleton } from '@/components/app/skeletons'
import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <CarregandoTela>
      <Skeleton className="h-8 w-40" aria-hidden />
      <ListaSkeleton linhas={4} />
    </CarregandoTela>
  )
}
