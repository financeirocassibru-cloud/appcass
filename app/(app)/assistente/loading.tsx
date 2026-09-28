import { CarregandoTela, ListaSkeleton } from '@/components/app/skeletons'
import { Skeleton } from '@/components/ui/skeleton'

// v1.1 — 28/09/2026: largura de formulário no computador, a do Assistente.
export default function Loading() {
  return (
    <CarregandoTela largura="formulario">
      <Skeleton className="h-8 w-40" aria-hidden />
      <Skeleton className="h-24 w-full rounded-xl" aria-hidden />
      <ListaSkeleton linhas={3} />
    </CarregandoTela>
  )
}
