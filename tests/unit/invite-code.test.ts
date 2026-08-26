import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EXPIRY_DAYS,
  expiryFromNow,
  generateInviteCode,
  hashInviteCode,
  isWellFormedInviteCode,
  normalizeInviteCode,
} from '@/lib/invite-code'

describe('generateInviteCode', () => {
  it('gera no formato de 5 grupos de 5', () => {
    expect(generateInviteCode()).toMatch(/^[A-Z0-9]{5}(-[A-Z0-9]{5}){4}$/)
  })

  it('não usa caracteres que se confundem ao ler', () => {
    // 0/O, 1/I/L, 2/Z, 5/S e 8/B saem do alfabeto: o código é ditado por
    // mensagem e conferido a olho.
    const ambiguos = ['0', 'O', '1', 'I', 'L', '2', 'Z', '5', 'S', '8', 'B']
    const amostra = Array.from({ length: 200 }, () => generateInviteCode()).join('')
    for (const char of ambiguos) {
      expect(amostra).not.toContain(char)
    }
  })

  it('não repete códigos', () => {
    const codigos = new Set(Array.from({ length: 1000 }, () => generateInviteCode()))
    expect(codigos.size).toBe(1000)
  })

  it('distribui os caracteres sem viés de módulo', () => {
    // A geração usa rejeição de amostra porque 256 não é múltiplo de 25. Com
    // `% 25` puro, os bytes 250-255 sobram para as 6 primeiras letras, que
    // passariam a sair 11 vezes a cada 256 em vez de 10 — cerca de 9% acima do
    // esperado.
    //
    // O tamanho da amostra foi escolhido para separar esse viés do ruído: com
    // 20 mil códigos o desvio máximo fica perto de 2% na implementação correta
    // e perto de 9% na ingênua, então 5% distingue as duas sem oscilar.
    const contagem = new Map<string, number>()
    const amostra = Array.from({ length: 20_000 }, () => generateInviteCode())
      .join('')
      .replace(/-/g, '')

    for (const char of amostra) {
      contagem.set(char, (contagem.get(char) ?? 0) + 1)
    }

    expect(contagem.size).toBe(25)

    const esperado = amostra.length / 25
    for (const [char, n] of contagem) {
      expect(Math.abs(n - esperado) / esperado, `caractere ${char}`).toBeLessThan(0.05)
    }
  })
})

describe('normalizeInviteCode', () => {
  it('aceita o código como a pessoa colar', () => {
    const canonico = 'ACDEF-GHJKM-NPQRT-UVWXY-34679'
    expect(normalizeInviteCode(canonico)).toBe('ACDEFGHJKMNPQRTUVWXY34679')
    expect(normalizeInviteCode('acdef-ghjkm-npqrt-uvwxy-34679')).toBe(
      'ACDEFGHJKMNPQRTUVWXY34679',
    )
    expect(normalizeInviteCode('  ACDEF GHJKM NPQRT UVWXY 34679  ')).toBe(
      'ACDEFGHJKMNPQRTUVWXY34679',
    )
  })
})

describe('hashInviteCode', () => {
  it('é determinístico — é o que permite buscar pelo código', () => {
    const code = generateInviteCode()
    expect(hashInviteCode(code)).toBe(hashInviteCode(code))
  })

  it('ignora formatação, então o hash não depende de como foi colado', () => {
    const canonico = 'ACDEF-GHJKM-NPQRT-UVWXY-34679'
    expect(hashInviteCode(canonico)).toBe(hashInviteCode('acdefghjkmnpqrtuvwxy34679'))
    expect(hashInviteCode(canonico)).toBe(hashInviteCode(' ACDEF GHJKM NPQRT UVWXY 34679 '))
  })

  it('devolve um sha256 em hexadecimal', () => {
    expect(hashInviteCode(generateInviteCode())).toMatch(/^[0-9a-f]{64}$/)
  })

  it('códigos diferentes têm hashes diferentes', () => {
    expect(hashInviteCode(generateInviteCode())).not.toBe(hashInviteCode(generateInviteCode()))
  })
})

describe('isWellFormedInviteCode', () => {
  it('aceita o que a geração produz', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(isWellFormedInviteCode(generateInviteCode())).toBe(true)
    }
  })

  it('rejeita comprimento errado', () => {
    expect(isWellFormedInviteCode('ACDEF')).toBe(false)
    expect(isWellFormedInviteCode('ACDEF-GHJKM-NPQRT-UVWXY-34679-EXTRA')).toBe(false)
  })

  it('rejeita caractere fora do alfabeto', () => {
    // O 'O' e o '0' não existem no alfabeto; digitar um deles é erro de leitura.
    expect(isWellFormedInviteCode('OCDEF-GHJKM-NPQRT-UVWXY-34679')).toBe(false)
    expect(isWellFormedInviteCode('0CDEF-GHJKM-NPQRT-UVWXY-34679')).toBe(false)
  })

  it('rejeita vazio', () => {
    expect(isWellFormedInviteCode('')).toBe(false)
    expect(isWellFormedInviteCode('   ')).toBe(false)
  })
})

describe('expiryFromNow', () => {
  it('soma dias à data de referência', () => {
    const agora = new Date('2026-03-01T12:00:00Z')
    expect(expiryFromNow(7, agora).toISOString()).toBe('2026-03-08T12:00:00.000Z')
    expect(expiryFromNow(DEFAULT_EXPIRY_DAYS, agora).toISOString()).toBe(
      '2026-03-08T12:00:00.000Z',
    )
  })

  it('atravessa a virada de mês', () => {
    const agora = new Date('2026-02-25T00:00:00Z')
    expect(expiryFromNow(7, agora).toISOString()).toBe('2026-03-04T00:00:00.000Z')
  })
})
