import { describe, expect, it } from 'vitest'
import { parseLooseJson } from '@/lib/ai/json'
import {
  draftItemSchema,
  draftPromptBlock,
  draftSummary,
  parseTriage,
  TRIAGE_SYSTEM_INSTRUCTION,
} from '@/lib/ai/triage'

/**
 * A triagem — o primeiro tempo da conversa. v1.0 — 2026-09-26.
 *
 * O que estes testes fixam: o portão do "é assunto deste app?" vale mais que o palpite;
 * o rascunho obedece aos mesmos invariantes de dinheiro e data que a proposta; e nada
 * daqui derruba a tela quando o modelo responde torto.
 */

function ler(objeto: unknown) {
  return parseTriage(objeto)
}

/** O item como o modelo o manda: campos ausentes, sem normalização. */
const item = (extra: Record<string, unknown> = {}) => ({
  intent: 'saida',
  amount_cents: 20000,
  occurred_on: '2026-09-26',
  description: 'Mercado',
  ...extra,
})

/**
 * O item como ele existe depois do schema.
 *
 * As funções de texto recebem sempre a saída do `draftItemSchema`, em que ausente já
 * virou `null`. Montar a fixture à mão testaria uma forma que não acontece.
 */
const normalizado = (extra: Record<string, unknown> = {}) => draftItemSchema.parse(item(extra))

describe('parseTriage: o portão da pertinência', () => {
  it('não-pertinente descarta os itens, mesmo se o modelo mandar alguns', () => {
    // O portão vale mais que o palpite: se não é assunto de dinheiro, não há rascunho
    // que salve — e deixar itens passar aqui viraria proposta adiante.
    const lido = ler({
      pertinent: false,
      reply: 'Eu cuido do seu dinheiro.',
      items: [item()],
      question: 'Quanto foi?',
    })

    expect(lido?.pertinent).toBe(false)
    expect(lido?.items).toEqual([])
    expect(lido?.question).toBeNull()
  })

  it('pertinente mantém o rascunho', () => {
    const lido = ler({ pertinent: true, reply: 'Entendi.', items: [item()] })

    expect(lido?.pertinent).toBe(true)
    expect(lido?.items).toHaveLength(1)
  })

  it('sem itens é resposta legítima — a IA está perguntando algo', () => {
    const lido = ler({ pertinent: true, reply: 'Quanto você gastou?', question: 'Qual o valor?' })

    expect(lido?.items).toEqual([])
    expect(lido?.question).toBe('Qual o valor?')
  })
})

describe('parseTriage: os invariantes de dinheiro e data valem no rascunho', () => {
  it('recusa valor decimal — o mesmo bug de float que a proposta barra', () => {
    expect(ler({ pertinent: true, reply: 'ok', items: [item({ amount_cents: 87.5 })] })).toBeNull()
  })

  it('recusa valor zero e negativo', () => {
    expect(ler({ pertinent: true, reply: 'ok', items: [item({ amount_cents: 0 })] })).toBeNull()
    expect(ler({ pertinent: true, reply: 'ok', items: [item({ amount_cents: -100 })] })).toBeNull()
  })

  it('aceita valor ausente — "gastei no mercado" sem valor é caso de perguntar', () => {
    const lido = ler({
      pertinent: true,
      reply: 'Quanto foi?',
      items: [item({ amount_cents: null })],
    })

    expect(lido?.items[0]?.amount_cents).toBeNull()
  })

  it('recusa data que não é YYYY-MM-DD', () => {
    expect(ler({ pertinent: true, reply: 'ok', items: [item({ occurred_on: '26/09/2026' })] })).toBeNull()
    expect(ler({ pertinent: true, reply: 'ok', items: [item({ occurred_on: 'ontem' })] })).toBeNull()
    expect(
      ler({ pertinent: true, reply: 'ok', items: [item({ occurred_on: '2026-09-26T00:00:00Z' })] }),
    ).toBeNull()
  })

  it('recusa intent que não está na lista', () => {
    expect(ler({ pertinent: true, reply: 'ok', items: [item({ intent: 'transferencia' })] })).toBeNull()
  })

  it('recusa parcelamento em 1x — "1x" é lançamento avulso', () => {
    expect(ler({ pertinent: true, reply: 'ok', items: [item({ installments: 1 })] })).toBeNull()
  })
})

describe('parseTriage: resposta torta não derruba a tela', () => {
  it('devolve null em vez de estourar', () => {
    expect(ler(null)).toBeNull()
    expect(ler(undefined)).toBeNull()
    expect(ler('texto solto')).toBeNull()
    expect(ler({})).toBeNull()
    expect(ler({ reply: 'sem o portão' })).toBeNull()
  })

  it('lê a triagem que veio dentro de cerca de markdown', () => {
    const texto = '```json\n' + JSON.stringify({ pertinent: true, reply: 'Entendi.' }) + '\n```'
    expect(parseTriage(parseLooseJson(texto))?.reply).toBe('Entendi.')
  })
})

describe('draftSummary: o texto de reserva, para a tela nunca ficar muda', () => {
  it('formata o valor em reais, nunca em centavos crus', () => {
    const texto = draftSummary([normalizado({ amount_cents: 200000 })])

    // `\s` e não um espaço literal: `formatCents` separa o símbolo com espaço
    // não-quebrável, como o pt-BR manda.
    expect(texto).toMatch(/R\$\s2\.000,00/)
    expect(texto).not.toContain('200000')
  })

  it('formata a data por fatiamento de string, sem Date', () => {
    // `new Date('2026-03-05')` lê como UTC e volta um dia em fuso negativo.
    const texto = draftSummary([normalizado({ occurred_on: '2026-03-05' })])

    expect(texto).toContain('05/03/2026')
  })

  it('diz o que fazer quando não identificou nada', () => {
    expect(draftSummary([])).toContain('Pode contar de outro jeito?')
  })

  it('conta as coisas quando há mais de uma', () => {
    const texto = draftSummary([normalizado(), normalizado({ description: 'Uber' })])

    expect(texto).toContain('2 coisas')
  })
})

describe('draftPromptBlock: o rascunho para o segundo tempo', () => {
  it('diz "não informado" em vez de omitir o campo vazio', () => {
    // Omitir convidaria o modelo a preencher a lacuna que a pessoa já disse não saber.
    const bloco = draftPromptBlock([normalizado({ amount_cents: null })])

    expect(bloco).toContain('não informado')
  })

  it('numera os itens', () => {
    const bloco = draftPromptBlock([normalizado(), normalizado()])

    expect(bloco).toContain('1. ')
    expect(bloco).toContain('2. ')
  })
})

describe('a instrução da triagem', () => {
  it('manda decidir a pertinência antes de qualquer coisa', () => {
    expect(TRIAGE_SYSTEM_INSTRUCTION).toContain('pertinent = false')
  })

  it('proíbe calcular a data de hoje por conta própria', () => {
    expect(TRIAGE_SYSTEM_INSTRUCTION).toContain('Nunca calcule a data de hoje')
  })

  it('exige centavos inteiros, com exemplos', () => {
    expect(TRIAGE_SYSTEM_INSTRUCTION).toContain('centavos inteiros')
    expect(TRIAGE_SYSTEM_INSTRUCTION).toContain('8750')
  })

  it('pede JSON sem cerca — a lição do resumo que voltou ilegível', () => {
    expect(TRIAGE_SYSTEM_INSTRUCTION).toContain('Sem cerca de markdown')
  })

  it('diz que nada foi registrado, para a IA não prometer o que não fez', () => {
    expect(TRIAGE_SYSTEM_INSTRUCTION).toContain('você não registrou nada')
  })
})
