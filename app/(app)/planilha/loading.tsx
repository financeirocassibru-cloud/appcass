import { CarregandoTela, ListaSkeleton } from '@/components/app/skeletons'
import { Skeleton } from '@/components/ui/skeleton'

// v1.0 — 28/09/2026 (Fase 14): o esqueleto da planilha, na largura de painel.
export default function Loading() {
  return (
    <CarregandoTela largura="painel">
      <Skeleton className="h-8 w-48" aria-hidden />
      <Skeleton className="h-11 w-full" aria-hidden />
      <ListaSkeleton linhas={8} />
    </CarregandoTela>
  )
}
