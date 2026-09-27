import { formatCents } from '@/lib/finance/money'
import { parseCsv } from './csv'
import { withImportKeys } from './fingerprint'
import { parsePdfPages, type PdfPage } from './pdf-layout'
import { ImportError, MAX_IMPORT_ROWS, type KeyedRow, type ParseResult, type StatementTotals } from './types'

/**
 * Entrada da importação de extrato. v1.0 — 2026-09-27.
 *
 * Tudo aqui é puro: recebe bytes ou itens de texto já extraídos e devolve linhas. Quem abre
 * o arquivo é `read-file.ts`, no navegador — o arquivo nunca vai para o servidor.
 */

export * from './types'

/** CSV em UTF-8 ou, se não for UTF-8 válido, em Windows-1252 (o padrão de banco antigo). */
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

export function isPdfBytes(bytes: Uint8Array): boolean {
  // "%PDF" nos primeiros bytes — a extensão do arquivo pode mentir, a assinatura não.
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024))
  return head.includes('%PDF')
}

function assertLimit(count: number): void {
  if (count > MAX_IMPORT_ROWS) {
    throw new ImportError(
      `Este extrato tem ${count} lançamentos, e o limite é ${MAX_IMPORT_ROWS} por arquivo. ` +
        'Exporte um período menor e importe em partes.',
    )
  }
}

function bankFromName(fileName: string): string | null {
  if (/(^|[^a-z0-9])nu_\d/i.test(fileName)) return 'Nubank'
  return null
}

export function parseCsvStatement(text: string, fileName = ''): ParseResult {
  const { rows, skipped, allInferred } = parseCsv(text)
  if (rows.length === 0) {
    throw new ImportError(
      'Não encontrei lançamentos neste CSV. Confira se ele tem colunas de data, valor e descrição.',
    )
  }
  assertLimit(rows.length)

  const warnings: string[] = []
  if (skipped > 0) {
    warnings.push(
      skipped === 1
        ? '1 linha do arquivo não parecia um lançamento e ficou de fora.'
        : `${skipped} linhas do arquivo não pareciam lançamentos e ficaram de fora.`,
    )
  }
  if (allInferred) {
    warnings.push('O arquivo não diz o que é entrada e o que é saída. Deduzi pelo texto — confira as marcadas.')
  }

  return { format: 'csv', rows, warnings, bankHint: bankFromName(fileName), statementTotals: null }
}

export function parsePdfStatement(pages: readonly PdfPage[], fileName = ''): ParseResult {
  const parsed = parsePdfPages(pages)

  if (parsed.textLines === 0) {
    throw new ImportError(
      'Este PDF não tem texto — parece uma imagem escaneada. Baixe o extrato em PDF pelo app do banco, ou em CSV.',
    )
  }
  if (parsed.rows.length === 0) {
    throw new ImportError(
      'Li o PDF, mas não reconheci lançamentos nele. Se o banco oferecer, tente o extrato em CSV.',
    )
  }
  assertLimit(parsed.rows.length)

  const warnings: string[] = []
  const inferred = parsed.rows.filter((r) => r.kindInferred).length
  if (inferred > 0) {
    warnings.push(
      inferred === 1
        ? 'Em 1 lançamento o extrato não dizia se era entrada ou saída. Deduzi pelo texto — confira.'
        : `Em ${inferred} lançamentos o extrato não dizia se era entrada ou saída. Deduzi pelo texto — confira os marcados.`,
    )
  }

  return {
    format: 'pdf',
    rows: parsed.rows,
    warnings,
    bankHint: parsed.bankHint ?? bankFromName(fileName),
    statementTotals: parsed.statementTotals,
  }
}

export interface TotalsCheck {
  incomeCents: number
  expenseCents: number
  /** `null` quando o extrato não declara totais para comparar. */
  matches: boolean | null
  message: string | null
}

/** Soma o que foi lido e compara com o que o extrato declara. */
export function checkTotals(
  rows: readonly { kind: 'income' | 'expense'; amountCents: number }[],
  declared: StatementTotals | null,
): TotalsCheck {
  let incomeCents = 0
  let expenseCents = 0
  for (const row of rows) {
    if (row.kind === 'income') incomeCents += row.amountCents
    else expenseCents += row.amountCents
  }
  if (!declared) return { incomeCents, expenseCents, matches: null, message: null }

  const problems: string[] = []
  if (declared.incomeCents !== null && declared.incomeCents !== incomeCents) {
    problems.push(`entradas ${formatCents(incomeCents)} (extrato diz ${formatCents(declared.incomeCents)})`)
  }
  if (declared.expenseCents !== null && declared.expenseCents !== expenseCents) {
    problems.push(`saídas ${formatCents(expenseCents)} (extrato diz ${formatCents(declared.expenseCents)})`)
  }
  return {
    incomeCents,
    expenseCents,
    matches: problems.length === 0,
    message: problems.length === 0 ? null : `A soma lida não bate: ${problems.join('; ')}. Confira antes de lançar.`,
  }
}

export async function keyRows(result: ParseResult): Promise<KeyedRow[]> {
  return withImportKeys(result.rows)
}

export type { PdfPage }
