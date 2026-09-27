import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cancelInteraction,
  GeminiError,
  getInteraction,
  interactionText,
  isTerminal,
  runInteraction,
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

  it('leva as ferramentas', async () => {
    const doFetch = vi.fn(async () => resposta({ id: 'int-1' }))

    await startInteraction({ model: 'm', input: 'oi', tools: TOOLS }, doFetch)

    const [, init] = doFetch.mock.calls[0] as unknown as [string, RequestInit]
    const body = JSON.parse(String(init.body)) as Record<string, unknown>

    expect((body.tools as unknown[]).length).toBe(TOOLS.length)
  })

  it('NUNCA manda tool_choice — foi ele que derrubou a IA em produção', async () => {
    // 400 `Unknown parameter 'tool_choice'`: o campo mora em
    // `generation_config`, não na raiz. E `auto`, que era o valor mandado, já é
    // o padrão — então a correção é omitir, não realocar. Este teste existe
    // para ninguém "consertar" isto reintroduzindo o campo.
    const doFetch = vi.fn(async () => resposta({ id: 'int-1' }))

    await startInteraction({ model: 'm', input: 'oi', tools: TOOLS }, doFetch)

    const [, init] = doFetch.mock.calls[0] as unknown as [string, RequestInit]
    const body = JSON.parse(String(init.body)) as Record<string, unknown>

    expect(body.tool_choice).toBeUndefined()
    expect(body.generation_config).toBeUndefined()
  })

  it('só manda parâmetros que a API documenta', async () => {
    // O provedor recusa o corpo INTEIRO no primeiro parâmetro desconhecido, e
    // erra um por vez: um campo a mais esconde os outros e vira uma sequência de
    // deploys para descobrir. Esta lista é o contrato.
    const doFetch = vi.fn(async () => resposta({ id: 'int-1' }))

    await startInteraction(
      {
        model: 'm',
        input: 'oi',
        systemInstruction: 'regras',
        tools: TOOLS,
        responseSchema: { type: 'object' },
      },
      doFetch,
    )

    const [, init] = doFetch.mock.calls[0] as unknown as [string, RequestInit]
    const body = JSON.parse(String(init.body)) as Record<string, unknown>

    expect(Object.keys(body).sort()).toEqual(
      ['background', 'input', 'model', 'response_format', 'system_instruction', 'tools'].sort(),
    )
  })

  it('omite ferramentas quando não há nenhuma', async () => {
    const doFetch = vi.fn(async () => resposta({ id: 'int-1' }))

    await startInteraction({ model: 'm', input: 'oi' }, doFetch)

    const [, init] = doFetch.mock.calls[0] as unknown as [string, RequestInit]
    const body = JSON.parse(String(init.body)) as Record<string, unknown>

    expect(body.tools).toBeUndefined()
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

  it('explica um 400 como problema do app, não de quem escreveu a frase', async () => {
    // Foi o caso real do `tool_choice`: a tela mostrava JSON cru em inglês num
    // app em português, e parecia erro de digitação da pessoa.
    const doFetch = vi.fn(async () =>
      resposta({ error: { message: "Unknown parameter 'x'." } }, 400),
    )

    const erro = await startInteraction({ model: 'm', input: 'oi' }, doFetch).catch((e) => e)

    expect((erro as Error).message).toContain('problema do app')
    expect((erro as Error).message).toContain('tentar de novo não resolve')
    // O detalhe técnico fica: esconder trocaria um erro feio por um erro mudo.
    expect((erro as Error).message).toContain('Unknown parameter')
  })

  it('aponta a chave quando ela é recusada, e a cota quando ela estoura', async () => {
    for (const [status, esperado] of [
      [401, 'GEMINI_API_KEY'],
      [403, 'GEMINI_API_KEY'],
      [429, 'cota'],
      [404, 'GEMINI_MODELS'],
      [503, 'indisponível'],
    ] as [number, string][]) {
      const doFetch = vi.fn(async () => resposta({ error: 'x' }, status))
      const erro = await startInteraction({ model: 'm', input: 'oi' }, doFetch).catch((e) => e)
      expect((erro as Error).message, `status ${status}`).toContain(esperado)
    }
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

  // v1.1 — 2026-09-27: o mock tem o formato do JSON REST de verdade. O anterior trazia
  // `output_text`, que só os SDKs montam — e foi por isso que o teste passava enquanto o
  // Diagnóstico falhava sempre em produção.
  it('devolve os passos, e o texto sai dos passos de model_output', async () => {
    const doFetch = vi.fn(async () =>
      resposta({
        id: 'int-1',
        status: 'completed',
        steps: [
          { type: 'function_call', name: 'create_entry' },
          { type: 'model_output', content: [{ type: 'text', text: 'pronto' }] },
        ],
      }),
    )

    const interaction = await getInteraction('int-1', doFetch)

    expect(interaction.status).toBe('completed')
    expect(interaction.steps).toHaveLength(2)
    expect(interactionText(interaction)).toBe('pronto')
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

describe('interactionText', () => {
  it('junta as partes de texto de todos os passos model_output', () => {
    expect(
      interactionText({
        id: 'x',
        steps: [
          { type: 'user_input', content: [{ type: 'text', text: 'pergunta' }] },
          { type: 'model_output', content: [{ type: 'text', text: 'Olá, ' }] },
          { type: 'model_output', content: [{ type: 'text', text: 'tudo certo.' }] },
        ],
      }),
    ).toBe('Olá, tudo certo.')
  })

  it('ignora partes que não são texto e passos tortos', () => {
    expect(
      interactionText({
        id: 'x',
        steps: [
          null,
          'lixo',
          { type: 'model_output', content: 'não é lista' },
          { type: 'model_output', content: [{ type: 'image', data: '...' }, { type: 'text', text: 'ok' }] },
        ],
      }),
    ).toBe('ok')
  })

  it('aceita output_text, se um dia vier', () => {
    expect(interactionText({ id: 'x', output_text: 'legado' })).toBe('legado')
  })

  it('sem texto nenhum devolve null', () => {
    expect(interactionText({ id: 'x', steps: [] })).toBeNull()
    expect(interactionText({ id: 'x' })).toBeNull()
    expect(interactionText({ id: 'x', steps: [{ type: 'model_output', content: [{ type: 'text', text: '  ' }] }] })).toBeNull()
    expect(interactionText(null)).toBeNull()
  })
})

describe('runInteraction', () => {
  it('devolve na primeira resposta quando ela já traz texto nos passos', async () => {
    const doFetch = vi.fn(async () =>
      resposta({
        id: 'int-1',
        status: 'in_progress',
        steps: [{ type: 'model_output', content: [{ type: 'text', text: '{"a":1}' }] }],
      }),
    )

    const interaction = await runInteraction({ model: 'm', input: 'oi' }, doFetch)

    expect(doFetch).toHaveBeenCalledTimes(1)
    expect(interactionText(interaction)).toBe('{"a":1}')
  })
})

describe('isTerminal', () => {
  it('reconhece os estados finais, inclusive o "cancelled" com dois L', () => {
    expect(isTerminal('completed')).toBe(true)
    expect(isTerminal('failed')).toBe(true)
    expect(isTerminal('cancelled')).toBe(true)
    // v1.1 — 2026-09-27: `incomplete` é final na API; sem ele o Diagnóstico esperava a
    // fatia inteira de 20s por uma interação já encerrada.
    expect(isTerminal('incomplete')).toBe(true)
  })

  it('em andamento e ausente não são finais', () => {
    expect(isTerminal('in_progress')).toBe(false)
    expect(isTerminal('requires_action')).toBe(false)
    expect(isTerminal(undefined)).toBe(false)
  })
})
