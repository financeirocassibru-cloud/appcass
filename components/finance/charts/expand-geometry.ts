/**
 * Decisões de geometria da tela cheia do gráfico (`chart-expander.tsx`).
 *
 * v1.0 — 28/09/2026: separadas do componente para serem testáveis sem DOM. Recebem o que o
 * navegador responde por parâmetro, em vez de ler `matchMedia`/`innerHeight` sozinhas.
 */

/** Largura a partir da qual o app usa o layout de computador — o `lg:` do Tailwind. */
export const DESKTOP_MIN_WIDTH_PX = 1024

/** A mesma fronteira, como media query. */
export const DESKTOP_MEDIA_QUERY = `(min-width: ${DESKTOP_MIN_WIDTH_PX}px)`

/**
 * Espaço vertical da camada ampliada que NÃO é do gráfico: padding de cima e de baixo, a linha do
 * "Fechar", o vão até o gráfico e a legenda (que só às vezes aparece — conta-se sempre, para a
 * altura não pular quando ela entra).
 */
const EXPANDED_CHROME_PX = 140

/** Abaixo disto, ampliar não ganharia nada sobre a altura padrão do gráfico (244 px). */
const MIN_EXPANDED_HEIGHT_PX = 260

/**
 * `true` quando a tela cheia precisa girar o conteúdo por CSS para ficar em paisagem.
 *
 * v1.0 — 28/09/2026: só em retrato. Antes a rotação entrava sempre que `orientation.lock` falhava
 * — e no Chrome, Edge e Firefox de computador ele existe e **rejeita** (não há o que travar num
 * monitor). O resultado era o gráfico girado 90° numa tela que já estava em paisagem. No iPhone em
 * retrato, que é para quem a rotação existe, a resposta continua `true`.
 */
export function needsCssRotation(isPortrait: boolean): boolean {
  return isPortrait
}

/**
 * Altura do gráfico ampliado, ou `undefined` para manter a altura padrão.
 *
 * v1.0 — 28/09/2026: só no computador. No celular a tela cheia continua com a altura de sempre —
 * o layout de lá está como deve, e em paisagem a altura útil mal passa da padrão.
 */
export function expandedChartHeight(
  viewportHeight: number,
  isDesktop: boolean,
): number | undefined {
  if (!isDesktop) return undefined
  const height = Math.floor(viewportHeight - EXPANDED_CHROME_PX)
  return height >= MIN_EXPANDED_HEIGHT_PX ? height : undefined
}
