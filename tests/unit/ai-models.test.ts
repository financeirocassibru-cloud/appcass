import { describe, expect, it } from 'vitest'
import {
  DEADLINE_MS,
  DEFAULT_MODEL_CHAIN,
  isRetriableHttpStatus,
  nextModel,
  parseModelChain,
  resolveStartModel,
  shouldFallback,
} from '@/lib/ai/models'

describe('parseModelChain', () => {
  it('usa a cadeia padrão quando a variável não existe', () => {
    expect(parseModelChain(undefined)).toEqual(DEFAULT_MODEL_CHAIN)
  })

  it('o padrão começa pelo modelo mais recente', () => {
    expect(DEFAULT_MODEL_CHAIN[0]).toBe('gemini-3.8-flash')
  })

  it('a cadeia padrão não tem repetido', () => {
    expect(new Set(DEFAULT_MODEL_CHAIN).size).toBe(DEFAULT_MODEL_CHAIN.length)
  })

  it('lê a lista da variável de ambiente, normalizando espaço e caixa', () => {
    expect(parseModelChain(' Gemini-3.8-Flash , gemini-3.6-flash ')).toEqual([
      'gemini-3.8-flash',
      'gemini-3.6-flash',
    ])
  })

  it('remove duplicata — repetir faria a queda tentar o modelo que acabou de falhar', () => {
    expect(parseModelChain('a,b,a,b,c')).toEqual(['a', 'b', 'c'])
  })

  it('volta ao padrão quando a variável está vazia ou só tem lixo', () => {
    // Um erro de digitação numa variável de ambiente não pode deixar o app sem IA.
    expect(parseModelChain('')).toEqual(DEFAULT_MODEL_CHAIN)
    expect(parseModelChain('  ,  , ')).toEqual(DEFAULT_MODEL_CHAIN)
  })
})

describe('resolveStartModel', () => {
  const chain = ['a', 'b', 'c']

  it('sem preferência, começa pelo mais recente', () => {
    expect(resolveStartModel(null, chain)).toBe('a')
    expect(resolveStartModel(undefined, chain)).toBe('a')
    expect(resolveStartModel('', chain)).toBe('a')
  })

  it('respeita a escolha manual', () => {
    expect(resolveStartModel('b', chain)).toBe('b')
    expect(resolveStartModel('  B  ', chain)).toBe('b')
  })

  it('ignora preferência que saiu da cadeia', () => {
    // Modelo aposentado gravado em profiles.ai_model não pode travar a IA de
    // quem o escolheu um dia.
    expect(resolveStartModel('gemini-2.0-obsoleto', chain)).toBe('a')
  })

  it('recusa cadeia vazia em vez de devolver undefined', () => {
    expect(() => resolveStartModel(null, [])).toThrow()
  })
})

describe('nextModel', () => {
  const chain = ['a', 'b', 'c']

  it('avança na ordem de lançamento', () => {
    expect(nextModel(chain, 'a')).toBe('b')
    expect(nextModel(chain, 'b')).toBe('c')
  })

  it('devolve null no fim da cadeia', () => {
    expect(nextModel(chain, 'c')).toBeNull()
  })

  it('recomeça do topo se o modelo atual saiu da cadeia', () => {
    // Trocaram GEMINI_MODELS com um trabalho já no ar: ainda há o que tentar.
    expect(nextModel(chain, 'sumiu')).toBe('a')
  })

  it('devolve null quando não há cadeia nenhuma', () => {
    expect(nextModel([], 'a')).toBeNull()
  })
})

describe('isRetriableHttpStatus', () => {
  it('cota, timeout, modelo inexistente e indisponibilidade valem outra tentativa', () => {
    expect(isRetriableHttpStatus(429)).toBe(true)
    expect(isRetriableHttpStatus(408)).toBe(true)
    expect(isRetriableHttpStatus(404)).toBe(true)
    expect(isRetriableHttpStatus(500)).toBe(true)
    expect(isRetriableHttpStatus(503)).toBe(true)
  })

  it('pedido malformado não melhora em outro modelo', () => {
    expect(isRetriableHttpStatus(400)).toBe(false)
    expect(isRetriableHttpStatus(401)).toBe(false)
    expect(isRetriableHttpStatus(403)).toBe(false)
  })
})

describe('shouldFallback', () => {
  const deadlineMs = DEADLINE_MS.interpret

  it('não cai enquanto está no prazo', () => {
    expect(shouldFallback({ status: 'in_progress', elapsedMs: 5_000, deadlineMs })).toBe(false)
  })

  it('cai quando o modelo demora além do prazo — o caso "ofereça outro"', () => {
    expect(shouldFallback({ status: 'in_progress', elapsedMs: deadlineMs, deadlineMs })).toBe(true)
    expect(shouldFallback({ status: 'in_progress', elapsedMs: deadlineMs + 1, deadlineMs })).toBe(
      true,
    )
  })

  it('cai quando a interação falhou, mesmo dentro do prazo', () => {
    expect(shouldFallback({ status: 'failed', elapsedMs: 1, deadlineMs })).toBe(true)
  })

  it('cai por status HTTP que outro modelo pode aceitar', () => {
    expect(shouldFallback({ httpStatus: 429, elapsedMs: 1, deadlineMs })).toBe(true)
    expect(shouldFallback({ httpStatus: 404, elapsedMs: 1, deadlineMs })).toBe(true)
  })

  it('não cai por pedido malformado', () => {
    expect(shouldFallback({ httpStatus: 400, elapsedMs: 1, deadlineMs })).toBe(false)
  })

  it('não cai quando já terminou bem, por mais que tenha demorado', () => {
    expect(shouldFallback({ status: 'completed', elapsedMs: 999_999, deadlineMs })).toBe(false)
  })

  it('sem status ainda, trata como em andamento e respeita o prazo', () => {
    expect(shouldFallback({ elapsedMs: 10, deadlineMs })).toBe(false)
    expect(shouldFallback({ elapsedMs: deadlineMs, deadlineMs })).toBe(true)
  })

  it('o resumo tem prazo maior que a interpretação', () => {
    expect(DEADLINE_MS.insights).toBeGreaterThan(DEADLINE_MS.interpret)
  })
})
