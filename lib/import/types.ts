import type { ISODate } from '@/lib/finance/date'

/**
 * Tipos da importação de extrato. v1.0 — 2026-09-27.
 *
 * O arquivo do banco nunca sai do aparelho: ele vira uma lista de `ParsedRow` na memória do
 * navegador, a pessoa confere, e só as linhas confirmadas viajam para a Server Action. Nada
 * aqui guarda o arquivo, o texto bruto do PDF nem o CSV inteiro.
 */

export type EntryKind = 'expense' | 'income'

/** Uma linha de extrato já entendida, antes da conferência. */
export interface ParsedRow {
  /** Posição na ordem do extrato — é por ela que a tela agrupa e ordena. */
  index: number
  occurredOn: ISODate
  kind: EntryKind
  /** Sempre positivo: o sentido está em `kind` (invariante 1 — centavos inteiros). */
  amountCents: number
  /** Texto original do banco, inteiro, com espaços normalizados. Vai para Observação. */
  original: string
  /** A descrição curta que a pessoa vê e que vira `entries.description` (≤120). */
  description: string
  /** Chave para agrupar lançamentos da mesma contraparte ("Pix para Fulano"). */
  counterpartyKey: string
  /**
   * `true` quando o extrato não disse se era entrada ou saída e o sentido foi deduzido por
   * palavra-chave. A tela destaca a linha para a pessoa conferir.
   */
  kindInferred: boolean
}

/** Linha com a chave de idempotência já calculada (ver `fingerprint.ts`). */
export interface KeyedRow extends ParsedRow {
  importKey: string
}

/** Totais que o próprio extrato declara, quando declara. Servem para conferir a leitura. */
export interface StatementTotals {
  incomeCents: number | null
  expenseCents: number | null
}

export interface ParseResult {
  format: 'csv' | 'pdf'
  rows: ParsedRow[]
  /** Avisos para a pessoa, em português. Não impedem a importação. */
  warnings: string[]
  /** Banco reconhecido, só para a tela dizer "Extrato Nubank". Nunca muda a leitura. */
  bankHint: string | null
  statementTotals: StatementTotals | null
}

/** Um pedaço de texto posicionado, como o pdf.js entrega. `y` cresce para cima. */
export interface TextItem {
  str: string
  x: number
  y: number
  /** Largura em pontos. Zero quando o extrator não soube dizer. */
  width: number
}

/** Limite de lançamentos por arquivo — pedido do produto, e também o que a Server Action aceita. */
export const MAX_IMPORT_ROWS = 1000

/** Limite do arquivo, para um PDF gigante não travar o celular antes de qualquer aviso. */
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024

/** Erro que a pessoa lê. A mensagem já está em português e pronta para a tela. */
export class ImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImportError'
  }
}
