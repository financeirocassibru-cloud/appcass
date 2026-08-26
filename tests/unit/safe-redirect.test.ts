import { describe, expect, it } from 'vitest'
import { safeRedirectPath } from '@/lib/safe-redirect'

describe('safeRedirectPath', () => {
  it('aceita caminho relativo', () => {
    expect(safeRedirectPath('/lancamentos')).toBe('/lancamentos')
    expect(safeRedirectPath('/ajustes/convites')).toBe('/ajustes/convites')
    expect(safeRedirectPath('/projecao?mes=2026-01')).toBe('/projecao?mes=2026-01')
  })

  it('bloqueia redirecionamento aberto por barra dupla', () => {
    // O navegador trata //exemplo.com como URL absoluta para outro host.
    expect(safeRedirectPath('//exemplo.com')).toBe('/')
    expect(safeRedirectPath('//exemplo.com/phishing')).toBe('/')
  })

  it('bloqueia barra seguida de contrabarra', () => {
    expect(safeRedirectPath('/\\exemplo.com')).toBe('/')
  })

  it('bloqueia URL absoluta', () => {
    expect(safeRedirectPath('https://exemplo.com')).toBe('/')
    expect(safeRedirectPath('http://exemplo.com')).toBe('/')
    expect(safeRedirectPath('javascript:alert(1)')).toBe('/')
  })

  it('bloqueia caractere de controle e espaço', () => {
    expect(safeRedirectPath('/ /exemplo.com')).toBe('/')
    expect(safeRedirectPath('/\nexemplo')).toBe('/')
    expect(safeRedirectPath('/\texemplo')).toBe('/')
  })

  it('cai no padrão para entrada ausente ou de outro tipo', () => {
    expect(safeRedirectPath(null)).toBe('/')
    expect(safeRedirectPath(undefined)).toBe('/')
    expect(safeRedirectPath('')).toBe('/')
    expect(safeRedirectPath(42)).toBe('/')
  })

  it('respeita o padrão informado', () => {
    expect(safeRedirectPath(null, '/login')).toBe('/login')
  })
})
