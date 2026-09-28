import { Skeleton } from '@/components/ui/skeleton'

/**
 * Esqueletos de carregamento.
 *
 * Servem para a tela não pular quando o conteúdo chega: cada bloco ocupa mais
 * ou menos o espaço do que vai substituí-lo. Um spinner centralizado seria mais
 * simples e pior — a página saltaria no momento em que os dados chegassem.
 *
 * `aria-hidden` e `role="status"` no contêiner: quem usa leitor de tela ouve
 * "carregando" uma vez, em vez da descrição de doze retângulos.
 */

function Bloco({ className }: { className?: string }) {
  return <Skeleton className={className} />
}

export function ListaSkeleton({ linhas = 4 }: { linhas?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      {Array.from({ length: linhas }, (_, index) => (
        <div key={index} className="flex items-center gap-3 rounded-xl bg-[var(--surface)] p-4">
          <Bloco className="size-11 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Bloco className="h-4 w-2/3" />
            <Bloco className="h-3 w-1/3" />
          </div>
          <Bloco className="h-4 w-16 shrink-0" />
        </div>
      ))}
    </div>
  )
}

export function HeroiSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-[var(--surface)] p-5" aria-hidden>
      <Bloco className="h-4 w-24" />
      <Bloco className="h-10 w-48" />
      <div className="grid grid-cols-2 gap-3 pt-1">
        <Bloco className="h-8" />
        <Bloco className="h-8" />
      </div>
    </div>
  )
}

export function GraficoSkeleton({ altura = 'h-[220px]' }: { altura?: string }) {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      <Bloco className="h-5 w-40" />
      <div className="rounded-xl bg-[var(--surface)] p-4">
        <Bloco className={`w-full ${altura}`} />
      </div>
    </div>
  )
}

/**
 * v1.1 — 28/09/2026: largura no computador (`lg:`, ≥ 1024 px), acompanhando a da tela que vai
 * chegar, para o esqueleto não pular de largura quando o conteúdo entra. No celular continua
 * `max-w-md` em todas.
 */
const LARGURA_LG = {
  painel: 'lg:max-w-6xl',
  lista: 'lg:max-w-4xl',
  formulario: 'lg:max-w-2xl',
} as const

/** Envelope que anuncia o carregamento uma vez só. */
export function CarregandoTela({
  children,
  largura = 'lista',
}: {
  children: React.ReactNode
  /** v1.1 — 28/09/2026: largura no computador. */
  largura?: keyof typeof LARGURA_LG
}) {
  return (
    <main
      role="status"
      aria-live="polite"
      aria-label="Carregando"
      className={`mx-auto flex max-w-md flex-col gap-6 px-6 py-8 lg:px-10 lg:py-10 ${LARGURA_LG[largura]}`}
    >
      {children}
    </main>
  )
}
