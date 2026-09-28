/**
 * Regras de navegação compartilhadas entre a barra inferior (celular) e a lateral (computador).
 *
 * v1.0 — 28/09/2026: `isActive` saiu de `bottom-nav.tsx` para cá, sem mudar de comportamento,
 * para a barra lateral não reimplementar a mesma regra.
 */

/** `true` se a rota atual pertence a este destino. */
export function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

/**
 * O destino mais específico que casa com a rota — o de `href` mais longo.
 *
 * v1.0 — 28/09/2026: a barra lateral lista destinos aninhados (Ajustes e Ajustes › Categorias),
 * e com `isActive` puro os dois acenderiam juntos em `/ajustes/categorias`.
 */
export function activeHref(pathname: string, hrefs: readonly string[]): string | null {
  let best: string | null = null
  for (const href of hrefs) {
    if (isActive(pathname, href) && (best === null || href.length > best.length)) best = href
  }
  return best
}
