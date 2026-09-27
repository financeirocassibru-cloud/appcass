import Image from 'next/image'
import { cn } from '@/lib/utils'

/**
 * Logo do Cass — v1.1 — 27/09/2026.
 *
 * v1.0 (27/09/2026): criado com a troca do nome do app para Cass. Aparece no topo das telas
 * de entrar/criar conta e no canto superior esquerdo do Início.
 * v1.1 (27/09/2026): sai a prop `withName` — o nome ao lado do logo foi retirado e ela tinha
 * ficado só zerando o `alt`, o que deixava o logo do Início mudo para leitor de tela. Entra
 * `target`, que marca o logo onde termina a animação de abertura do PWA (`LaunchSplash`).
 *
 * Aponta para `public/icons/logo.svg` em vez de embutir o `<path>`: são ≈14 KB de desenho que,
 * inline, iriam no HTML de toda página que mostra o logo; como arquivo, ficam em cache. SVG
 * não passa pelo otimizador do `next/image` — ele serve o arquivo como está.
 */

// Proporção do `viewBox` do logo (409 × 291).
const ASPECT = 409 / 291

export function Logo({
  height = 28,
  target = false,
  className,
}: {
  /** Altura do desenho em px; a largura segue a proporção do logo. */
  height?: number
  /** v1.1: destino do voo da animação de abertura (ver `components/app/launch-splash.tsx`). */
  target?: boolean
  className?: string
}) {
  return (
    <span className={cn('inline-flex items-center', className)}>
      <Image
        src="/icons/logo.svg"
        width={Math.round(height * ASPECT)}
        height={height}
        alt="Cass"
        priority
        data-cass-logo-target={target ? '' : undefined}
      />
    </span>
  )
}
