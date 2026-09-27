import { describe, expect, it } from 'vitest'
import {
  checkTotals,
  decodeText,
  ImportError,
  isPdfBytes,
  keyRows,
  MAX_IMPORT_ROWS,
  parseCsvStatement,
  parsePdfStatement,
} from '@/lib/import'
import { parseCsv } from '@/lib/import/csv'
import { parseStatementDate } from '@/lib/import/dates'
import { counterpartyKey, summarize } from '@/lib/import/describe'
import { keySources } from '@/lib/import/fingerprint'
import { parseStatementAmount } from '@/lib/import/money'
import { genericPdf, NUBANK_CSV, nubankPdf } from './import-fixtures'

/**
 * Importação de extrato. v1.0 — 2026-09-27.
 *
 * O que mais importa provar: que mudança pequena de layout não muda o que se lê, e que o
 * mesmo extrato em CSV e em PDF gera as mesmas chaves — é isso que impede o histórico de
 * dobrar quando a pessoa importa o mesmo período duas vezes.
 */

describe('parseStatementAmount', () => {
  it.each([
    ['4000.00', 400000, false],
    ['-4.69', -469, true],
    ['- 6.327,48', -632748, true],
    ['+ 7.000,00', 700000, true],
    ['R$ -1.234,56', -123456, true],
    ['(1.234,56)', -123456, true],
    ['1.234,56 D', -123456, true],
    ['1.234,56 C', 123456, true],
    ['1.234,56-', -123456, true],
    ['1,234.56', 123456, false],
    ['0,25', 25, false],
  ])('%s → %i', (texto, centavos, sinal) => {
    expect(parseStatementAmount(texto)).toEqual({ cents: centavos, explicitSign: sinal })
  })

  it('no modo estrito, número sem centavos não é dinheiro (ano, código de banco)', () => {
    expect(parseStatementAmount('2026')).toBeNull()
    expect(parseStatementAmount('(0341)')).toBeNull()
    expect(parseStatementAmount('Conta: 1234-5')).toBeNull()
  })

  it('no modo tolerante (coluna Valor do CSV), aceita inteiro', () => {
    expect(parseStatementAmount('-50', { lenient: true })).toEqual({ cents: -5000, explicitSign: true })
  })
})

describe('parseStatementDate', () => {
  it.each([
    ['01/09/2026', '2026-09-01'],
    ['1/9/26', '2026-09-01'],
    ['2026-09-01', '2026-09-01'],
    ['01 SET 2026', '2026-09-01'],
    ['5 de março de 2026', '2026-03-05'],
    ['01 DE SETEMBRO DE 2026', '2026-09-01'],
  ])('%s → %s', (texto, iso) => {
    expect(parseStatementDate(texto, { anchored: true })).toBe(iso)
  })

  it('completa o ano pelo período quando falta', () => {
    expect(parseStatementDate('05 SET', { anchored: true, fallbackYear: 2026 })).toBe('2026-09-05')
    expect(parseStatementDate('05/09', { anchored: true, fallbackYear: 2026 })).toBe('2026-09-05')
  })

  it('recusa data que não existe e data solta no meio do texto', () => {
    expect(parseStatementDate('31/02/2026', { anchored: true })).toBeNull()
    expect(parseStatementDate('99* POP 04Set 08h37min', { anchored: true })).toBeNull()
    expect(parseStatementDate('Extrato gerado dia 26 de setembro de 2026', { anchored: true })).toBeNull()
  })
})

describe('summarize', () => {
  it('Pix vira "Pix para/de" com o nome arrumado, e o resto fica de fora', () => {
    expect(
      summarize('Transferência enviada pelo Pix - Fulana de Tal - •••.111.222-•• - NU PAGAMENTOS - IP (0260) Agência: 1 Conta: 9999-1'),
    ).toBe('Pix para Fulana de Tal')
    expect(summarize('Transferência recebida pelo Pix - JOAO DA SILVA - •••.1-•• - BCO (0001)')).toBe('Pix de Joao da Silva')
  })

  it('compra mantém o estabelecimento e tira dia e hora da corrida', () => {
    expect(summarize('Compra no débito via NuPay - 99')).toBe('Compra no débito via NuPay · 99')
    expect(summarize('Compra no débito - 99* POP 04Set 08h37min')).toBe('Compra no débito · 99* POP')
  })

  it('estorno diz que é estorno', () => {
    expect(summarize('Estorno - Compra no débito - Uber UBER *TRIP')).toBe('Estorno: Compra no débito · Uber UBER *TRIP')
  })

  it('texto desconhecido cai no primeiro trecho, sem inventar', () => {
    expect(summarize('Pagamento de fatura')).toBe('Pagamento de fatura')
  })

  it('a chave agrupa a mesma corrida em horários diferentes', () => {
    expect(counterpartyKey(summarize('Compra no débito - 99* POP 04Set 08h37min'))).toBe(
      counterpartyKey(summarize('Compra no débito - 99* POP 11Set 11h15min')),
    )
  })
})

describe('CSV', () => {
  it('lê o extrato Nubank', () => {
    const result = parseCsvStatement(NUBANK_CSV, 'NU_123_01SET2026.csv')
    expect(result.rows).toHaveLength(6)
    expect(result.bankHint).toBe('Nubank')
    expect(result.rows[0]).toMatchObject({
      occurredOn: '2026-09-01',
      kind: 'income',
      amountCents: 30000,
      description: 'Pix de Empresa Exemplo Ltda',
      kindInferred: false,
    })
    expect(result.rows[3]?.original).toContain('Conta: 9999-1')
  })

  it('colunas em outra ordem, ponto e vírgula e vírgula decimal dão o mesmo resultado', () => {
    const csv = [
      'Descrição;Valor;Data',
      'Compra no débito via NuPay - 99;-4,69;01/09/2026',
      '"Pix recebido - Fulano; com ponto e vírgula";1.300,00;02/09/2026',
    ].join('\n')
    const { rows } = parseCsv(csv)
    expect(rows.map((r) => [r.occurredOn, r.kind, r.amountCents])).toEqual([
      ['2026-09-01', 'expense', 469],
      ['2026-09-02', 'income', 130000],
    ])
  })

  it('colunas separadas de crédito e débito, com saldo que é ignorado', () => {
    const csv = ['Data;Histórico;Crédito;Débito;Saldo', '05/09/2026;PIX ENVIADO;;50,00;950,00', '06/09/2026;SALARIO;3.000,00;;3.950,00'].join(
      '\n',
    )
    const { rows } = parseCsv(csv)
    expect(rows.map((r) => [r.kind, r.amountCents, r.kindInferred])).toEqual([
      ['expense', 5000, false],
      ['income', 300000, false],
    ])
  })

  it('sem cabeçalho, acha as colunas pelo conteúdo', () => {
    const csv = ['Pix enviado Fulano,05/09/2026,-50.00', 'Salario,06/09/2026,3000.00'].join('\n')
    const { rows } = parseCsv(csv)
    expect(rows.map((r) => [r.occurredOn, r.kind, r.amountCents])).toEqual([
      ['2026-09-05', 'expense', 5000],
      ['2026-09-06', 'income', 300000],
    ])
  })

  it('vírgula sem aspas dentro da descrição volta para a descrição', () => {
    const { rows } = parseCsv('Data,Valor,Descrição\n01/09/2026,-10.00,Mercado, padaria e cia\n')
    expect(rows[0]?.original).toBe('Mercado, padaria e cia')
  })

  it('arquivo em Windows-1252 (banco antigo) é decodificado', () => {
    // "Descrição" com ç = 0xE7 e ã = 0xE3.
    const bytes = new Uint8Array([...new TextEncoder().encode('Data;Valor;Descri'), 0xe7, 0xe3, ...new TextEncoder().encode('o\n01/09/2026;-1,00;P')])
    expect(decodeText(bytes)).toContain('Descrição')
  })

  it('só valores positivos e nenhuma pista: sentido deduzido e marcado', () => {
    const result = parseCsvStatement('Data,Valor,Descrição\n01/09/2026,10.00,Mercado\n02/09/2026,50.00,Pix recebido de Ana\n')
    expect(result.rows.map((r) => [r.kind, r.kindInferred])).toEqual([
      ['expense', true],
      ['income', true],
    ])
    expect(result.warnings.join(' ')).toMatch(/Deduzi/)
  })

  it(`recusa mais de ${MAX_IMPORT_ROWS} lançamentos`, () => {
    const linhas = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `01/09/2026,-1.00,Item ${i}`)
    expect(() => parseCsvStatement(`Data,Valor,Descrição\n${linhas.join('\n')}`)).toThrow(ImportError)
  })

  it('aceita exatamente o limite', () => {
    const linhas = Array.from({ length: MAX_IMPORT_ROWS }, (_, i) => `01/09/2026,-1.00,Item ${i}`)
    expect(parseCsvStatement(`Data,Valor,Descrição\n${linhas.join('\n')}`).rows).toHaveLength(MAX_IMPORT_ROWS)
  })
})

describe('PDF', () => {
  it('lê o layout Nubank: sinal pelo grupo, continuação e quebra de página', () => {
    const result = parsePdfStatement(nubankPdf())
    expect(result.rows.map((r) => [r.occurredOn, r.kind, r.amountCents])).toEqual([
      ['2026-09-01', 'income', 30000],
      ['2026-09-01', 'expense', 469],
      ['2026-09-01', 'expense', 469],
      ['2026-09-01', 'expense', 3082],
      ['2026-09-03', 'income', 2000],
      ['2026-09-03', 'expense', 2000],
    ])
    expect(result.rows[0]?.original).toBe(
      'Transferência recebida pelo Pix - EMPRESA EXEMPLO LTDA - 12.345.678 /0001-90 - BANCO X (0001) Agência: 1 Conta: 1234-5',
    )
    // A continuação estava no topo da página seguinte.
    expect(result.rows[3]?.original).toContain('Conta: 9999-1')
    // O título em duas linhas foi remontado na coluna certa.
    expect(result.rows[4]?.description).toBe('Pix no crédito (valor adicionado)')
    expect(result.rows.every((r) => !r.kindInferred)).toBe(true)
    expect(result.bankHint).toBeNull()
  })

  it('a soma bate com o total que o extrato declara', () => {
    const result = parsePdfStatement(nubankPdf())
    expect(result.statementTotals).toEqual({ incomeCents: 32000, expenseCents: 6020 })
    expect(checkTotals(result.rows, result.statementTotals)).toMatchObject({ matches: true, message: null })
  })

  it('a tabela deslocada para o lado lê igual', () => {
    const normal = parsePdfStatement(nubankPdf()).rows
    const deslocado = parsePdfStatement(nubankPdf(35)).rows
    expect(deslocado.map((r) => r.original)).toEqual(normal.map((r) => r.original))
  })

  it('outro layout: data por linha, sinal no valor, coluna de saldo ignorada', () => {
    const result = parsePdfStatement(genericPdf())
    expect(result.rows.map((r) => [r.occurredOn, r.kind, r.amountCents, r.kindInferred])).toEqual([
      ['2026-09-05', 'expense', 5000, false],
      ['2026-09-06', 'income', 300000, true],
    ])
  })

  it('PDF sem texto é recusado com explicação', () => {
    expect(() => parsePdfStatement([{ height: 842, items: [] }])).toThrow(/imagem/)
  })

  it('reconhece a assinatura de PDF mesmo com extensão errada', () => {
    expect(isPdfBytes(new TextEncoder().encode('%PDF-1.4\n...'))).toBe(true)
    expect(isPdfBytes(new TextEncoder().encode('Data,Valor'))).toBe(false)
  })
})

describe('chave de importação', () => {
  it('o mesmo extrato em CSV e em PDF gera as mesmas chaves', async () => {
    const csv = await keyRows(parseCsvStatement(NUBANK_CSV))
    const pdf = await keyRows(parsePdfStatement(nubankPdf()))
    expect(pdf.map((r) => r.importKey).sort()).toEqual(csv.map((r) => r.importKey).sort())
    expect(csv.every((r) => /^[0-9a-f]{64}$/.test(r.importKey))).toBe(true)
  })

  it('duas compras idênticas no mesmo dia são dois lançamentos', async () => {
    const rows = await keyRows(parseCsvStatement(NUBANK_CSV))
    expect(new Set(rows.map((r) => r.importKey)).size).toBe(rows.length)
    const fontes = keySources(parseCsvStatement(NUBANK_CSV).rows)
    expect(fontes[1]?.endsWith('|1')).toBe(true)
    expect(fontes[2]?.endsWith('|2')).toBe(true)
  })

  it('reimportar o mesmo arquivo gera as mesmas chaves', async () => {
    const a = await keyRows(parseCsvStatement(NUBANK_CSV))
    const b = await keyRows(parseCsvStatement(NUBANK_CSV))
    expect(a.map((r) => r.importKey)).toEqual(b.map((r) => r.importKey))
  })
})
