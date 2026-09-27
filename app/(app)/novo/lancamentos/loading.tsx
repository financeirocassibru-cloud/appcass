// v1.0 — 2026-09-27: esqueleto de "Ver lançamentos".
import { CarregandoTela, ListaSkeleton } from '@/components/app/skeletons'
import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <CarregandoTela>
      <Skeleton className="h-8 w-40" aria-hidden />
      <ListaSkeleton linhas={6} />
    </CarregandoTela>
  )
}
