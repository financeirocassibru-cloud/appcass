import type { PdfPage } from '@/lib/import'
import type { TextItem } from '@/lib/import/types'

/**
 * Extratos sintéticos para os testes de importação. v1.0 — 2026-09-27.
 *
 * Imitam a estrutura do extrato Nubank (PDF e CSV) com nomes e números inventados. O extrato
 * real que serviu de modelo tem nomes e CPF de terceiros e não entra no repositório.
 */

export const NUBANK_CSV = `Data,Valor,Identificador,Descrição
01/09/2026,300.00,aaaa-1,Transferência recebida pelo Pix - EMPRESA EXEMPLO LTDA - 12.345.678/0001-90 - BANCO X (0001) Agência: 1 Conta: 1234-5
01/09/2026,-4.69,aaaa-2,Compra no débito via NuPay - 99
01/09/2026,-4.69,aaaa-3,Compra no débito via NuPay - 99
01/09/2026,-30.82,aaaa-4,Transferência enviada pelo Pix - Fulana de Tal - •••.111.222-•• - NU PAGAMENTOS - IP (0260) Agência: 1 Conta: 9999-1
03/09/2026,20.00,aaaa-5,Valor adicionado na conta por cartão de crédito - Valor adicionado para Pix no Crédito
03/09/2026,-20.00,aaaa-5,Transferência enviada pelo Pix - LOJA EXEMPLO - 11.222.333/0001-44 - BCO Y (0033)
`

const item = (str: string, x: number, y: number): TextItem => ({ str, x, y, width: str.length * 4.4 })

/** Uma linha de várias células: `[texto, x]` na mesma altura. */
const line = (y: number, ...cells: [string, number][]) => cells.map(([s, x]) => item(s, x, y))

function header(page: number, total: number): TextItem[] {
  return [
    ...line(780, ['Fulano de Tal', 460]),
    ...line(768, ['CPF', 361], ['•••.123.456-••', 384], ['Agência', 442], ['0001', 484], ['Conta', 508]),
    ...line(705, ['01 DE SETEMBRO DE 2026', 57], ['a', 175], ['25 DE SETEMBRO DE 2026', 182], ['VALORES EM R$', 469]),
    ...line(110, ['Tem alguma dúvida? Fale com a gente pelo app.', 57]),
    ...line(61, ['Extrato gerado dia 26 de setembro de 2026 às 20:44', 110], [`${page} de ${total}`, 511]),
  ]
}

/** O mesmo extrato do CSV, no layout do PDF. `dx` desloca a tabela inteira. */
export function nubankPdf(dx = 0): PdfPage[] {
  const x = (v: number) => v + dx
  const page1: TextItem[] = [
    ...header(1, 2),
    ...line(670, ['Saldo inicial', 337], ['0,25', 516]),
    ...line(630, ['Total de entradas', 337], ['+320,00', 498]),
    ...line(610, ['Total de saídas', 337], ['-60,20', 496]),
    ...line(560, ['Movimentações', 57]),
    ...line(538, ['01 SET 2026', x(58)], ['Total de entradas', x(120)], ['+ 300,00', x(489)]),
    ...line(517, ['Transferência recebida pelo Pix', x(120)], ['EMPRESA EXEMPLO LTDA - 12.345.678', x(261)], ['300,00', x(505)]),
    ...line(497, ['/0001-90 - BANCO X (0001) Agência:', x(261)]),
    ...line(477, ['1 Conta: 1234-5', x(261)]),
    ...line(443, ['Total de saídas', x(120)], ['- 40,20', x(494)]),
    ...line(422, ['Compra no débito via NuPay', x(120)], ['99', x(261)], ['4,69', x(516)]),
    ...line(401, ['Compra no débito via NuPay', x(120)], ['99', x(261)], ['4,69', x(516)]),
    ...line(380, ['Transferência enviada pelo Pix', x(120)], ['Fulana de Tal - •••.111.222-•• - NU', x(261)], ['30,82', x(510)]),
  ]
  const page2: TextItem[] = [
    ...header(2, 2),
    // Continuação do último lançamento da página anterior.
    ...line(673, ['PAGAMENTOS - IP (0260) Agência: 1 Conta: 9999-1', x(261)]),
    ...line(640, ['03 SET 2026', x(58)], ['Total de entradas', x(120)], ['+ 20,00', x(503)]),
    // Título em duas linhas, com a coluna de detalhe colada nele.
    ...line(619, ['Valor adicionado na conta por', x(120)], ['Valor adicionado para Pix no Crédito', x(262)], ['20,00', x(510)]),
    ...line(599, ['cartão de crédito', x(120)]),
    ...line(565, ['Total de saídas', x(120)], ['- 20,00', x(506)]),
    ...line(544, ['Transferência enviada pelo Pix', x(120)], ['LOJA EXEMPLO - 11.222.333/0001-44 - BCO Y (0033)', x(262)], ['20,00', x(510)]),
  ]
  return [
    { height: 842, items: page1 },
    { height: 842, items: page2 },
  ]
}

/** Outro banco: data em cada linha, valor com sinal e coluna de saldo à direita. */
export function genericPdf(): PdfPage[] {
  return [
    {
      height: 842,
      items: [
        ...line(800, ['Banco Exemplo S.A.', 40]),
        ...line(760, ['Data', 40], ['Histórico', 100], ['Valor (R$)', 400], ['Saldo (R$)', 480]),
        ...line(740, ['05/09/2026', 40], ['PIX ENVIADO JOAO DA SILVA', 100], ['-50,00', 400], ['950,00', 480]),
        ...line(725, ['06/09/2026', 40], ['SALARIO EMPRESA', 100], ['3.000,00', 400], ['3.950,00', 480]),
        ...line(710, ['06/09/2026', 40], ['SALDO DO DIA', 100], ['3.950,00', 480]),
      ],
    },
  ]
}
