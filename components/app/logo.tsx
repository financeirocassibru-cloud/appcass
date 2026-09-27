import Image from 'next/image'
import { cn } from '@/lib/utils'

/**
 * Logo do Cass — v1.0 — 27/09/2026.
 *
 * v1.0 (27/09/2026): criado com a troca do nome do app para Cass. Aparece no topo das telas
 * de entrar/criar conta e no canto superior esquerdo do Início.
 *
 * Aponta para `public/icons/logo.svg` em vez de embutir o `<path>`: são ≈14 KB de desenho que,
 * inline, iriam no HTML de toda página que mostra o logo; como arquivo, ficam em cache. SVG
 * não passa pelo otimizador do `next/image` — ele serve o arquivo como está.
 */

// Proporção do `viewBox` do logo (409 × 291).
const ASPECT = 409 / 291

export function Logo({
  height = 28,
  withName = false,
  className,
}: {
  /** Altura do desenho em px; a largura segue a proporção do logo. */
  height?: number
  /** Mostra "Cass" ao lado do desenho. */
  withName?: boolean
  className?: string
}) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <Image
        src="/icons/logo.svg"
        width={Math.round(height * ASPECT)}
        height={height}
        // Com o nome escrito ao lado, o desenho é decorativo e o leitor de tela lê "Cass" uma vez.
        alt={withName ? '' : 'Cass'}
        priority
      />
    </span>
  )
}
