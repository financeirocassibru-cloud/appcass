import { describe, expect, it } from 'vitest'
import { parseLooseJson } from '@/lib/ai/json'
import { parseInsights } from '@/lib/ai/insights'

/**
 * A leitura do resumo. v1.0 — 2026-09-26.
 *
 * Existe por causa de "O resumo voltou em formato inesperado", que aparecia com a
 * resposta certa na mão: o modelo devolvia o objeto correto dentro de uma cerca
 * ```json e o `JSON.parse` cru descartava tudo.
 *
 * A regra que estes testes fixam: tolera-se o ENVELOPE, nunca o conteúdo.
 */

const valido = { summary: 'Você está no azul.', tips: ['Pague a conta de luz', 'Guarde 200'] }

describe('parseInsights aceita o envelope que o modelo costuma pôr em volta', () => {
  it('JSON limpo entra', () => {
    expect(parseInsights(JSON.stringify(valido))).toEqual(valido)
  })

  it('JSON dentro de cerca ```json entra — é o caso que quebrou em produção', () => {
    const texto = '```json\n' + JSON.stringify(valido) + '\n```'
    expect(parseInsights(texto)).toEqual(valido)
  })

  it('cerca sem rótulo de linguagem também entra', () => {
    expect(parseInsights('```\n' + JSON.stringify(valido) + '\n```')).toEqual(valido)
  })

  it('frase de cortesia antes do objeto não impede a leitura', () => {
    expect(parseInsights('Claro! Aqui está:\n' + JSON.stringify(valido))).toEqual(valido)
  })

  it('espaço e quebra de linha em volta não importam', () => {
    expect(parseInsights('\n\n  ' + JSON.stringify(valido) + '  \n')).toEqual(valido)
  })
})

describe('parseInsights não afrouxou a validação do conteúdo', () => {
  it('sem resposta nenhuma, null', () => {
    expect(parseInsights(undefined)).toBeNull()
    expect(parseInsights('')).toBeNull()
  })

  it('texto sem objeto nenhum, null', () => {
    expect(parseInsights('Não consegui gerar o resumo agora.')).toBeNull()
  })

  it('resumo sem dicas é recusado — meio resumo num app de dinheiro é pior que nenhum', () => {
    expect(parseInsights(JSON.stringify({ summary: 'Só isso' }))).toBeNull()
  })

  it('resumo vazio é recusado', () => {
    expect(parseInsights(JSON.stringify({ summary: '   ', tips: ['a'] }))).toBeNull()
  })

  it('dica vazia é recusada', () => {
    expect(parseInsights(JSON.stringify({ summary: 'ok', tips: [''] }))).toBeNull()
  })

  it('mais de seis dicas é recusado', () => {
    const tips = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    expect(parseInsights(JSON.stringify({ summary: 'ok', tips }))).toBeNull()
  })
})

describe('parseLooseJson', () => {
  it('distingue "o modelo respondeu null" de "não achei JSON"', () => {
    // `null` é valor JSON legítimo; `undefined` é o sinal de que não havia nada.
    expect(parseLooseJson('null')).toBeNull()
    expect(parseLooseJson('nada de JSON aqui')).toBeUndefined()
    expect(parseLooseJson(undefined)).toBeUndefined()
    expect(parseLooseJson('')).toBeUndefined()
  })

  it('lê lista, não só objeto', () => {
    expect(parseLooseJson('```json\n[1,2,3]\n```')).toEqual([1, 2, 3])
  })

  it('não inventa objeto a partir de chave solta', () => {
    expect(parseLooseJson('{ isto não é json }')).toBeUndefined()
  })
})
