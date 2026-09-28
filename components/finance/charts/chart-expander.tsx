'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Maximize2, Minimize2 } from 'lucide-react'
import { PortalContainerProvider } from '@/components/ui/portal-container'
import { Button } from '@/components/ui/button'
import {
  DESKTOP_MEDIA_QUERY,
  expandedChartHeight,
  needsCssRotation,
} from './expand-geometry'

/**
 * Amplia um gráfico para a tela cheia, em paisagem, e devolve o retrato ao fechar.
 *
 * v1.0 — 2026-09-27.
 *
 * v1.1 — 28/09/2026: no computador, ampliar girava o gráfico 90°. `orientation.lock` existe no
 * Chrome/Edge/Firefox de computador e **rejeita** — e a rejeição caía no fallback de rotação por
 * CSS, que é para o iPhone em retrato. Agora a rotação só entra com a tela em retrato
 * (`needsCssRotation`). E, só no computador, o gráfico ampliado ganha a altura da tela: `chart`
 * pode ser uma função que recebe a altura. No celular nada mudou.
 *
 * O que dá e o que não dá, dito de frente, porque o desenho todo depende disso:
 *
 * - `Element.requestFullscreen()` **não existe no Safari do iPhone**, em nenhuma versão, nem na
 *   aba nem no PWA instalado.
 * - `screen.orientation.lock()` exige fullscreen e **não existe em nenhum Safari**. Na prática é
 *   Chrome/Edge no Android. A promessa dele **rejeitar é o caminho normal**, não um erro — por
 *   isso todo `.catch` aqui vira o fallback em vez de propagar.
 *
 * Então a expansão é em três camadas, e cada uma funciona sozinha:
 *
 * 1. Uma camada `fixed inset-0` renderizada **no lugar** (sem portal). Só isso já entrega a tela
 *    cheia e já tem layout próprio para paisagem.
 * 2. `requestFullscreen()` por cima, quando existe: esconde a barra do navegador.
 * 3. `orientation.lock('landscape')` por cima, quando existe: gira o aparelho.
 *
 * Onde o passo 3 não existe, entra a rotação por CSS — e ela tem um custo real: num conteúdo
 * girado 90° o teclado sobe pelo lado físico, cobre o campo, e `scrollIntoView` rola no eixo
 * errado. Como esta tela tem formulário de lançamento, `rotationSuspended` desliga a rotação
 * enquanto um formulário está aberto: **o gráfico abre em paisagem, e a digitação volta ao eixo
 * natural do aparelho**, que é onde ela funciona.
 *
 * `app/manifest.ts` declara `orientation: 'any'` por causa do passo 3: com `portrait` o sistema
 * não gira o PWA instalado de jeito nenhum.
 */

/**
 * `lock` e `unlock` não estão na lib de tipos do TypeScript porque não estão em todo navegador —
 * e é justamente isso que o desenho aqui pressupõe. O tipo diz a verdade: pode não existir.
 */
type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: 'landscape') => Promise<void>
  unlock?: () => void
}

function orientationApi(): LockableOrientation | undefined {
  return typeof screen === 'undefined' ? undefined : (screen.orientation as LockableOrientation)
}

/** v1.1 — 28/09/2026: a tela está em retrato agora? */
function isPortrait(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(orientation: portrait)').matches
}

/** v1.1 — 28/09/2026: altura do gráfico ampliado; `undefined` fora do computador. */
function measureExpandedHeight(): number | undefined {
  return expandedChartHeight(window.innerHeight, matchMedia(DESKTOP_MEDIA_QUERY).matches)
}

/** v1.1 — 28/09/2026: o que o gráfico recebe quando `chart` é uma função. */
export interface ChartRenderContext {
  expanded: boolean
  /** Altura do gráfico ampliado no computador; `undefined` mantém a altura padrão. */
  height?: number
}

const DOUBLE_TAP_MS = 300
const DOUBLE_TAP_PX = 24
const DRAG_PX = 10

export function ChartExpander({
  chart,
  panel,
  rotationSuspended = false,
  label = 'o gráfico',
}: {
  /** O gráfico. É só neste contêiner que o duplo toque amplia — num botão, dois toques
   *  seguidos são dois cliques, não um pedido de tela cheia. */
  chart: React.ReactNode | ((context: ChartRenderContext) => React.ReactNode)
  /** O detalhamento do período. Em paisagem vai para a coluna da direita. */
  panel?: React.ReactNode
  /** `true` enquanto um formulário está aberto: a rotação por CSS sai de cena. */
  rotationSuspended?: boolean
  label?: string
}) {
  const [expanded, setExpanded] = useState(false)
  const [cssRotate, setCssRotate] = useState(false)
  // v1.1 — 28/09/2026: altura do gráfico ampliado; só é definida no computador.
  const [expandedHeight, setExpandedHeight] = useState<number | undefined>(undefined)
  const overlay = useRef<HTMLDivElement | null>(null)
  // Estado, e não o ref, porque o container do portal é lido durante a renderização.
  const [overlayEl, setOverlayEl] = useState<HTMLDivElement | null>(null)
  const lastTap = useRef<{ at: number; x: number; y: number } | null>(null)
  const pointerStart = useRef<{ x: number; y: number } | null>(null)
  const pushedHistory = useRef(false)

  const collapse = useCallback(() => {
    setExpanded(false)
    setCssRotate(false)

    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    // `unlock` lança onde não existe, então nunca sem guarda.
    try {
      orientationApi()?.unlock?.()
    } catch {
      /* sem suporte: nada a destravar */
    }

    // Desfaz o estado que a expansão empilhou, para o botão voltar não ter de ser usado duas
    // vezes depois de fechar pelo X.
    if (pushedHistory.current) {
      pushedHistory.current = false
      history.back()
    }
  }, [])

  const expand = useCallback(() => {
    // `flushSync` monta a camada AGORA, ainda dentro do gesto. Sem ele, `overlay.current` seria
    // null nesta linha — a camada só existiria no próximo commit — e o `requestFullscreen`
    // nunca seria chamado. Um `await` para esperar a montagem também não serve: gastaria a
    // ativação do usuário, e aí o navegador recusa.
    flushSync(() => {
      setExpanded(true)
      setExpandedHeight(measureExpandedHeight())
    })

    // O botão voltar do Android tem de fechar a tela cheia. Sem este estado ele sai de
    // `/analise` inteira e a pessoa perde o lugar no período.
    history.pushState({ chartExpanded: true }, '')
    pushedHistory.current = true

    const element = overlay.current
    if (!element?.requestFullscreen) {
      // v1.1 — 28/09/2026: girar só faz sentido em retrato.
      if (needsCssRotation(isPortrait())) setCssRotate(true)
      return
    }

    // Sem `await` antes da chamada: esperar qualquer coisa aqui gasta a ativação do usuário e o
    // navegador recusa o fullscreen.
    element
      .requestFullscreen()
      .then(() => orientationApi()?.lock?.('landscape'))
      // v1.1 — 28/09/2026: no computador `lock` rejeita sempre, e a tela já está em paisagem —
      // girar ali era o bug. A rotação por CSS fica só para quem está em retrato.
      .catch(() => {
        if (needsCssRotation(isPortrait())) setCssRotate(true)
      })
  }, [])

  useEffect(() => {
    if (!expanded) return

    function onPopState() {
      pushedHistory.current = false
      collapse()
    }
    function onFullscreenChange() {
      // Escape sai do fullscreen sem desmontar a camada; sem isto os dois estados divergem e a
      // camada fica aberta com a barra do navegador de volta.
      if (!document.fullscreenElement && expanded) collapse()
    }

    window.addEventListener('popstate', onPopState)
    document.addEventListener('fullscreenchange', onFullscreenChange)

    // Trava a rolagem de trás, guardando o valor anterior — não assumir `''`.
    const previousOverflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    overlay.current?.focus()

    return () => {
      window.removeEventListener('popstate', onPopState)
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      document.documentElement.style.overflow = previousOverflow
    }
  }, [expanded, collapse])

  // v1.1 — 28/09/2026: no computador o gráfico ampliado acompanha a altura da janela — que muda
  // ao entrar no fullscreen, daí o `resize`. No celular `expandedChartHeight` devolve `undefined`.
  // A primeira medida é tirada em `expand()`, junto com a montagem; aqui só se acompanha.
  useEffect(() => {
    if (!expanded) return
    function onResize() {
      setExpandedHeight(measureExpandedHeight())
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [expanded])

  const renderChart = (context: ChartRenderContext) =>
    typeof chart === 'function' ? chart(context) : chart

  const gestureProps = {
    onPointerDown: (event: React.PointerEvent) => {
      pointerStart.current = { x: event.clientX, y: event.clientY }
    },
    onPointerUp: (event: React.PointerEvent) => {
      const start = pointerStart.current
      pointerStart.current = null

      // Arrasto não é toque: navegar pelo período não pode abrir a tela cheia.
      if (
        start &&
        Math.hypot(event.clientX - start.x, event.clientY - start.y) > DRAG_PX
      ) {
        lastTap.current = null
        return
      }

      const now = Date.now()
      const previous = lastTap.current
      if (
        previous &&
        now - previous.at < DOUBLE_TAP_MS &&
        Math.hypot(event.clientX - previous.x, event.clientY - previous.y) < DOUBLE_TAP_PX
      ) {
        lastTap.current = null
        if (!expanded) expand()
        return
      }
      lastTap.current = { at: now, x: event.clientX, y: event.clientY }
    },
    // `dblclick` não é confiável em celular, mas no desktop é o gesto certo.
    onDoubleClick: () => {
      if (!expanded) expand()
    },
  }

  if (!expanded) {
    return (
      <div className="flex flex-col gap-2">
        <div {...gestureProps}>{renderChart({ expanded: false })}</div>
        {/* O botão é a via primária: duplo toque é indescobrível e inalcançável por teclado. */}
        <Button
          type="button"
          variant="ghost"
          onClick={expand}
          className="text-muted-foreground min-h-11 justify-center gap-2 text-xs"
        >
          <Maximize2 className="size-4" aria-hidden />
          Ampliar {label}
        </Button>
        {panel}
      </div>
    )
  }

  const rotate = cssRotate && !rotationSuspended

  return (
    <div
      ref={(element) => {
        overlay.current = element
        setOverlayEl(element)
      }}
      tabIndex={-1}
      role="dialog"
      aria-modal
      aria-label={`${label} em tela cheia`}
      onKeyDown={(event) => {
        if (event.key === 'Escape') collapse()
      }}
      className="fixed inset-0 z-50 overflow-hidden bg-[var(--background)] outline-none"
    >
      {/* Os portais do Radix abertos daqui vão para dentro da camada; em `document.body` eles
          ficariam fora da subárvore que o fullscreen exibe e não seriam desenhados. */}
      <PortalContainerProvider container={overlayEl}>
        <div
          // `100dvh`/`100dvw` são medidas do eixo NÃO girado, então trocam de papel aqui.
          style={
            rotate
              ? {
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100dvh',
                  height: '100dvw',
                  transform: 'translateX(100dvw) rotate(90deg)',
                  transformOrigin: 'top left',
                }
              : undefined
          }
          className={rotate ? 'overflow-y-auto' : 'h-full overflow-y-auto'}
        >
          <div className="flex min-h-full flex-col gap-3 p-4 pt-[env(safe-area-inset-top)]">
            <div className="flex items-center justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={collapse}
                className="text-muted-foreground min-h-11 gap-2 text-xs"
              >
                <Minimize2 className="size-4" aria-hidden />
                Fechar
              </Button>
            </div>

            {/* Em paisagem o gráfico fica com a largura e o painel vira coluna à direita.
                A variante `landscape:` lê a orientação do APARELHO, e quando a rotação é por CSS
                o aparelho está em retrato — justamente porque não deu para girá-lo. Então nesse
                caso a decisão vem do estado, e não da media query, que responderia o oposto do
                que está na tela. */}
            <div
              className={
                rotate
                  ? 'flex flex-1 flex-row gap-3'
                  : 'flex flex-1 flex-col gap-3 landscape:flex-row'
              }
            >
              <div {...gestureProps} className="min-w-0 flex-1">
                {renderChart({ expanded: true, height: expandedHeight })}
              </div>
              {panel ? (
                <div
                  className={
                    rotate
                      ? 'w-full max-w-xs shrink-0 overflow-y-auto'
                      : 'w-full shrink-0 overflow-y-auto landscape:max-w-xs lg:max-w-sm'
                  }
                >
                  {panel}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </PortalContainerProvider>
    </div>
  )
}
