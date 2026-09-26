import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cancelInteraction,
  GeminiError,
  getInteraction,
  isTerminal,
  startInteraction,
} from '@/lib/ai/gemini'
import { TOOLS } from '@/lib/ai/tools'

/**
 * Cliente do Gemini com `fetch` injetado.
 *
 * Nenhum teste aqui toca a rede nem precisa de chave real: o que importa provar
 * é como o cliente TRADUZ pedido e resposta, e como ele classifica falha — que é
 * o que decide a queda para o próximo modelo.
 */

/** Resposta HTTP falsa, no mínimo que o cliente lê. */
function resposta(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

beforeEach(() => {
  process.env.GEMINI_API_KEY = 'chave-de-teste'
})

afterEach(() => {
  delete process.env.GEMINI_API_KEY
  vi.restoreAllMocks()
})

describe('startInteraction', () => {
  it('sempre pede execução em background — é o que sobrevive ao app fechar', async () => {
    const doFetch = vi.fn(async () => resposta({ id: 'int-1', status: 'in_progress' }))

    await startInteraction({ model: 'gemini-3.8-flash', input: 'oi' }, doFetch)

    const [, init] = doFetch.mock.calls[0] as unknown as [string, RequestInit]
    const body = JSON.parse(String(init.body)) as Record<string, unknown>

    expect(body.background).toBe(true)
    expect(body.model).toBe('gemini-3.8-flash')
    expect(body.input).toBe('oi')
  })

  it('manda a chave e fixa a revisão da API', async () => {
    const doFetch = vi.fn(async () => resposta({ id: 'int-1' }))

    await startInteraction({ model: 'm', input: 'oi' }, doFetch)

    const [url, init] = doFetch.mock.calls[0] as unknown as [string, RequestInit]
    const headers = init.headers as Record<string, string>

    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/interactions')
    expect(headers['x-goog-api-key']).toBe('chave-de-teste')
    // Sem fixar a revisão, uma mudança de formato chegaria sozinha em produção.
    expect(headers['Api-Revision']).toBe('2026-05-20')
  })

  it('leva as ferramentas e deixa o modelo escolher se usa', async () => {
    const doFetch = vi.fn(async () => resposta({ id: 'int-1' }))

    await startInteraction({ model: 'm', input: 'oi', tools: TOOLS }, doFetch)

    const [, init] = doFetch.mock.calls[0] as unknown as [string, RequestInit]
    const body = JSON.parse(String(init.body)) as Record<string, unknown>

    expect((body.tools as unknown[]).length).toBe(TOOLS.length)
    // Forçar a chamada inventaria um lançamento a partir de uma frase ambígua.
    expect(body.tool_choice).toBe('auto')
  })

  it('omite ferramentas quando não há nenhuma', async () => {
    const doFetch = vi.fn(async () => resposta({ id: 'int-1' }))

    await startInteraction({ model: 'm', input: 'oi' }, doFetch)

    const [, init] = doFetch.mock.calls[0] as unknown as [string, RequestInit]
    const body = JSON.parse(String(init.body)) as Record<string, unknown>

    expect(body.tools).toBeUndefined()
    expect(body.tool_choice).toBeUndefined()
  })

  it('pede JSON quando há esquema de resposta', async () => {
    const doFetch = vi.fn(async () => resposta({ id: 'int-1' }))
    const schema = { type: 'object', properties: {} }

    await startInteraction({ model: 'm', input: 'oi', responseSchema: schema }, doFetch)

    const [, init] = doFetch.mock.calls[0] as unknown as [string, RequestInit]
    const body = JSON.parse(String(init.body)) as { response_format?: Record<string, unknown> }

    expect(body.response_format?.mime_type).toBe('application/json')
    expect(body.response_format?.schema).toEqual(schema)
  })

  it('preserva o status HTTP no erro — é ele que decide a queda para o próximo', async () => {
    const doFetch = vi.fn(async () => resposta({ error: 'cota' }, 429))

    await expect(startInteraction({ model: 'm', input: 'oi' }, doFetch)).rejects.toMatchObject({
      name: 'GeminiError',
      httpStatus: 429,
    })
  })

  it('trata modelo inexistente como 404, não como falha genérica', async () => {
    const doFetch = vi.fn(async () => resposta({ error: 'model not found' }, 404))

    await expect(startInteraction({ model: 'inexistente', input: 'oi' }, doFetch)).rejects
      .toMatchObject({ httpStatus: 404 })
  })

  it('converte abortar por tempo em 408 — o mesmo caminho de "demorou demais"', async () => {
    const doFetch = vi.fn(async () => {
      const erro = new Error('abortado')
      erro.name = 'AbortError'
      throw erro
    })

    await expect(startInteraction({ model: 'm', input: 'oi' }, doFetch)).rejects.toMatchObject({
      httpStatus: 408,
    })
  })

  it('falha de rede não vira status inventado', async () => {
    const doFetch = vi.fn(async () => {
      throw new Error('ECONNRESET')
    })

    const erro = await startInteraction({ model: 'm', input: 'oi' }, doFetch).catch((e) => e)

    expect(erro).toBeInstanceOf(GeminiError)
    expect((erro as GeminiError).httpStatus).toBeUndefined()
  })

  it('recusa corpo sem id em vez de seguir com um trabalho sem ponteiro', async () => {
    const doFetch = vi.fn(async () => resposta({ sem: 'id' }))

    await expect(startInteraction({ model: 'm', input: 'oi' }, doFetch)).rejects.toBeInstanceOf(
      GeminiError,
    )
  })

  it('aceita campos novos na resposta sem quebrar', async () => {
    // A API acrescenta campos; recusar a resposta inteira por isso seria
    // quebrar sozinho numa manhã de domingo.
    const doFetch = vi.fn(async () => resposta({ id: 'int-1', campo_novo: 42 }))

    await expect(startInteraction({ model: 'm', input: 'oi' }, doFetch)).resolves.toMatchObject({
      id: 'int-1',
    })
  })

  it('exige a chave de API configurada', async () => {
    delete process.env.GEMINI_API_KEY
    const doFetch = vi.fn(async () => resposta({ id: 'int-1' }))

    await expect(startInteraction({ model: 'm', input: 'oi' }, doFetch)).rejects.toThrow(
      /GEMINI_API_KEY/,
    )
  })
})

describe('getInteraction', () => {
  it('lê pelo id, com o id escapado na URL', async () => {
    const doFetch = vi.fn(async () => resposta({ id: 'a/b', status: 'completed' }))

    await getInteraction('a/b', doFetch)

    const [url, init] = doFetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/interactions/a%2Fb')
    expect(init.method).toBe('GET')
  })

  it('devolve os passos e o texto de saída', async () => {
    const doFetch = vi.fn(async () =>
      resposta({
        id: 'int-1',
        status: 'completed',
        steps: [{ type: 'function_call', name: 'create_entry' }],
        output_text: 'pronto',
      }),
    )

    const interaction = await getInteraction('int-1', doFetch)

    expect(interaction.status).toBe('completed')
    expect(interaction.steps).toHaveLength(1)
    expect(interaction.output_text).toBe('pronto')
  })
})

describe('cancelInteraction', () => {
  it('chama o endpoint de cancelamento', async () => {
    const doFetch = vi.fn(async () => resposta({ id: 'int-1', status: 'cancelled' }))

    await cancelInteraction('int-1', doFetch)

    const [url, init] = doFetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/interactions/int-1/cancel')
    expect(init.method).toBe('POST')
  })

  it('não propaga falha — já estamos no caminho de recuperação', async () => {
    const doFetch = vi.fn(async () => resposta({ error: 'nope' }, 500))

    await expect(cancelInteraction('int-1', doFetch)).resolves.toBeUndefined()
  })
})

describe('isTerminal', () => {
  it('reconhece os estados finais, inclusive o "cancelled" com dois L', () => {
    expect(isTerminal('completed')).toBe(true)
    expect(isTerminal('failed')).toBe(true)
    expect(isTerminal('cancelled')).toBe(true)
  })

  it('em andamento e ausente não são finais', () => {
    expect(isTerminal('in_progress')).toBe(false)
    expect(isTerminal('requires_action')).toBe(false)
    expect(isTerminal(undefined)).toBe(false)
  })
})
