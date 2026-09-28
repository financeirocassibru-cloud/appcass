import { describe, expect, it } from 'vitest'
import {
  DESKTOP_MEDIA_QUERY,
  expandedChartHeight,
  needsCssRotation,
} from '@/components/finance/charts/expand-geometry'
import { activeHref, isActive } from '@/components/app/nav-items'

/**
 * v1.0 — 28/09/2026: o gráfico da Análise, ampliado no computador, girava 90° como se estivesse
 * num celular em retrato. Estes testes seguram as duas decisões que corrigiram isso.
 */
describe('needsCssRotation', () => {
  it('gira só em retrato — o iPhone, para quem a rotação por CSS existe', () => {
    expect(needsCssRotation(true)).toBe(true)
  })

  it('não gira em paisagem — o computador, onde orientation.lock rejeita sempre', () => {
    expect(needsCssRotation(false)).toBe(false)
  })
})

describe('expandedChartHeight', () => {
  it('no celular mantém a altura padrão do gráfico', () => {
    expect(expandedChartHeight(390, false)).toBeUndefined()
    expect(expandedChartHeight(900, false)).toBeUndefined()
  })

  it('no computador acompanha a altura da janela', () => {
    expect(expandedChartHeight(900, true)).toBe(760)
    expect(expandedChartHeight(1080.5, true)).toBe(940)
  })

  it('numa janela baixa demais não encolhe abaixo da padrão', () => {
    expect(expandedChartHeight(300, true)).toBeUndefined()
  })

  it('usa a mesma fronteira do `lg:` do Tailwind', () => {
    expect(DESKTOP_MEDIA_QUERY).toBe('(min-width: 1024px)')
  })
})

describe('navegação', () => {
  it('isActive trata a raiz só como ela mesma', () => {
    expect(isActive('/', '/')).toBe(true)
    expect(isActive('/historico', '/')).toBe(false)
    expect(isActive('/metas/abc', '/metas')).toBe(true)
    expect(isActive('/metasx', '/metas')).toBe(false)
  })

  it('activeHref acende só o destino mais específico', () => {
    const hrefs = ['/', '/ajustes', '/ajustes/categorias', '/novo/lancamentos']
    expect(activeHref('/ajustes/categorias', hrefs)).toBe('/ajustes/categorias')
    expect(activeHref('/ajustes/saldo', hrefs)).toBe('/ajustes')
    expect(activeHref('/novo', hrefs)).toBeNull()
    expect(activeHref('/', hrefs)).toBe('/')
  })
})
