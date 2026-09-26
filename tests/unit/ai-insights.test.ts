import { describe, expect, it } from 'vitest'
import { parseLooseJson } from '@/lib/ai/json'
import {
  formatEntryLine,
  INSIGHTS_SYSTEM_INSTRUCTION,
  parsePeriodDays,
  PERIOD_DAYS,
  readInsightsText,
} from '@/lib/ai/insights'
import type { EntryWithCategory } from '@/lib/db/queries/entries'

/**
 * O resumo financeiro. v1.1 — 2026-09-26.
 *
 * A v1.0 destes testes cobria um formato fixo (`{summary, tips}`) que não existe mais.
 * Ele falhou três vezes em produção com "O resumo voltou em formato inesperado", sempre
 * com o conteúdo certo na mão — porque um modelo devolve a mesma coisa em mil formas
 * ligeiramente diferentes, e prever cada uma é uma corrida que não se ganha.
 *
 * Agora o resumo é texto corrido, e o que sobra para testar é o que ainda pode errar
 * em silêncio: o recorte do período e a formatação de dinheiro e data.
 */

describe('readInsightsText: texto é texto', () => {
  it('prosa em português entra inteira', () => {
    const prosa =
      'Você está no azul, mas duas contas venceram.\n\nAs duas somam R$ 340,00 e resolvê-las antes do dia 10 evita que o saldo fique negativo.'

    expect(readInsightsText(prosa)).toBe(prosa)
  })

  it('espaço e quebra de linha em volta são aparados', () => {
    expect(readInsightsText('\n\n  Está sob controle.  \n')).toBe('Está sob controle.')
  })

  it('nada de JSON é exigido — o que era erro agora é resposta comum', () => {
    // Exatamente a forma que a v1.1 recusava e fazia a tela mentir.
    expect(readInsightsText('Claro! Você gastou R$ 200,00 no mercado.')).toBe(
      'Claro! Você gastou R$ 200,00 no mercado.',
    )
  })

  it('vazio, só espaço e ausente devolvem null', () => {
    expect(readInsightsText(undefined)).toBeNull()
    expect(readInsightsText('')).toBeNull()
    expect(readInsightsText('   \n\t ')).toBeNull()
  })

  it('texto desgovernado é cortado, não recusado', () => {
    const gigante = 'a'.repeat(20_000)
    const lido = readInsightsText(gigante)

    expect(lido).not.toBeNull()
    expect(lido!.length).toBeLessThanOrEqual(8_001)
    expect(lido!.endsWith('…')).toBe(true)
  })

  it('texto no limite não ganha reticências', () => {
    const exato = 'b'.repeat(8_000)
    expect(readInsightsText(exato)).toBe(exato)
  })
})

describe('parsePeriodDays: o recorte do período', () => {
  it('aceita a faixa inteira', () => {
    expect(parsePeriodDays(1)).toBe(1)
    expect(parsePeriodDays(30)).toBe(30)
    expect(parsePeriodDays(60)).toBe(60)
  })

  it('recorta nas bordas em vez de recusar', () => {
    // Quem digitou 90 quis "bastante"; devolver erro seria trocar uma resposta por um
    // formulário.
    expect(parsePeriodDays(61)).toBe(PERIOD_DAYS.max)
    expect(parsePeriodDays(9_999)).toBe(PERIOD_DAYS.max)
    expect(parsePeriodDays(0)).toBe(PERIOD_DAYS.min)
    expect(parsePeriodDays(-5)).toBe(PERIOD_DAYS.min)
  })

  it('lê o que vem do formulário, que é sempre string', () => {
    expect(parsePeriodDays('45')).toBe(45)
    expect(parsePeriodDays('  7 ')).toBe(7)
  })

  it('o que não é número inteiro cai no padrão', () => {
    for (const entrada of ['', '   ', 'abc', '30.5', '30,5', null, undefined, {}, [], Number.NaN]) {
      expect(parsePeriodDays(entrada)).toBe(PERIOD_DAYS.default)
    }
  })

  it('o padrão nunca é zero — um resumo de zero dias não veria nada', () => {
    expect(PERIOD_DAYS.default).toBeGreaterThan(0)
    expect(PERIOD_DAYS.min).toBeGreaterThan(0)
    expect(PERIOD_DAYS.max).toBe(60)
  })
})

describe('formatEntryLine: dinheiro e data como a pessoa os lê', () => {
  const entrada = (extra: Partial<EntryWithCategory> = {}): EntryWithCategory =>
    ({
      id: 'e1',
      kind: 'expense',
      occurredOn: '2026-03-05',
      description: 'Mercado',
      amountCents: 200000,
      notes: null,
      isSettled: true,
      settledOn: '2026-03-05',
      source: 'manual',
      sourceId: null,
      occurrenceKey: null,
      installmentNumber: null,
      installmentTotal: null,
      category: { id: 'c1', name: 'Alimentação', color: '#000000', icon: null },
      ...extra,
    }) as EntryWithCategory

  it('valor em reais, nunca em centavos crus', () => {
    const linha = formatEntryLine(entrada())

    expect(linha).toMatch(/R\$\s2\.000,00/)
    expect(linha).not.toContain('200000')
  })

  it('data por fatiamento de string, sem Date', () => {
    // `new Date('2026-03-05')` lê como UTC e volta um dia em fuso negativo. O `test:tz`
    // roda esta suíte em Tóquio e Honolulu justamente por isso.
    expect(formatEntryLine(entrada())).toContain('05/03/2026')
  })

  it('diz saída ou entrada em português', () => {
    expect(formatEntryLine(entrada({ kind: 'expense' }))).toContain('saída')
    expect(formatEntryLine(entrada({ kind: 'income' }))).toContain('entrada')
  })

  it('diz pago ou pendente', () => {
    expect(formatEntryLine(entrada({ isSettled: true }))).toContain('pago')
    expect(formatEntryLine(entrada({ isSettled: false }))).toContain('pendente')
  })

  it('sem categoria é dito, não omitido', () => {
    expect(formatEntryLine(entrada({ category: null }))).toContain('sem categoria')
  })

  it('marca o que foi gerado por conta fixa ou parcelamento', () => {
    // Quem muda o valor de uma parcela mexe no plano, não na linha gerada — o modelo
    // precisa saber a diferença.
    expect(formatEntryLine(entrada({ source: 'recurring' }))).toContain('gerado por recurring')
    expect(formatEntryLine(entrada({ source: 'manual' }))).not.toContain('gerado por')
  })

  it('nunca vaza o id do lançamento', () => {
    expect(formatEntryLine(entrada())).not.toContain('e1')
  })
})

describe('a instrução do resumo', () => {
  it('pede texto corrido e proíbe JSON e markdown', () => {
    expect(INSIGHTS_SYSTEM_INSTRUCTION).toContain('texto corrido')
    expect(INSIGHTS_SYSTEM_INSTRUCTION).toContain('Sem JSON')
    expect(INSIGHTS_SYSTEM_INSTRUCTION).toContain('sem cerca de markdown')
  })

  it('manda usar o histórico para ser específico', () => {
    expect(INSIGHTS_SYSTEM_INSTRUCTION).toContain('histórico')
  })

  it('proíbe inventar número e recalcular', () => {
    expect(INSIGHTS_SYSTEM_INSTRUCTION).toContain('Não invente número')
    expect(INSIGHTS_SYSTEM_INSTRUCTION).toContain('Não recalcule')
  })

  it('proíbe conselho de investimento e moralizar', () => {
    expect(INSIGHTS_SYSTEM_INSTRUCTION).toContain('conselho de investimento')
    expect(INSIGHTS_SYSTEM_INSTRUCTION).toContain('Sem moralizar')
  })

  it('manda as sugestões virem na prosa, não em lista', () => {
    expect(INSIGHTS_SYSTEM_INSTRUCTION).toContain('Não as separe numa lista')
  })
})

/**
 * A leitura tolerante de JSON continua existindo — a triagem a usa, e foram estes
 * casos que provaram a correção da cerca ```json.
 */
describe('parseLooseJson', () => {
  it('lê JSON limpo, cercado e com frase em volta', () => {
    const objeto = { pertinent: true }

    expect(parseLooseJson(JSON.stringify(objeto))).toEqual(objeto)
    expect(parseLooseJson('```json\n' + JSON.stringify(objeto) + '\n```')).toEqual(objeto)
    expect(parseLooseJson('Claro! Aqui está:\n' + JSON.stringify(objeto))).toEqual(objeto)
  })

  it('distingue "o modelo respondeu null" de "não achei JSON"', () => {
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
