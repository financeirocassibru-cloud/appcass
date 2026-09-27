import { buildRow, isSummaryText } from './build'
import { fold, parseStatementDate } from './dates'
import { parseStatementAmount } from './money'
import type { EntryKind, ParsedRow } from './types'

/**
 * Leitura de extrato em CSV. v1.0 — 2026-09-27.
 *
 * O que torna isto resistente a mudança de layout:
 *
 * - **as colunas são achadas pelo nome, não pela posição**. "Data", "Valor" e "Descrição" podem
 *   vir em qualquer ordem, com acento ou sem, em português ou inglês;
 * - sem cabeçalho reconhecível, as colunas são achadas **pelo conteúdo** — a que mais tem
 *   datas, a que mais tem valores, e o texto mais longo;
 * - o delimitador (`,` `;` tab `|`) é detectado, e aspas são respeitadas;
 * - vírgula solta dentro da descrição, sem aspas, não desalinha a linha: o excesso volta
 *   para a coluna de descrição.
 */

type Role = 'date' | 'amount' | 'credit' | 'debit' | 'description' | 'type' | 'ignore'

const HEADER_SYNONYMS: Record<Exclude<Role, 'ignore'>, readonly string[]> = {
  date: [
    'data',
    'date',
    'dt',
    'dia',
    'data lancamento',
    'data de lancamento',
    'data da transacao',
    'data transacao',
    'data movimento',
    'data mov',
    'data do lancamento',
  ],
  amount: ['valor', 'value', 'amount', 'quantia', 'montante', 'valor r', 'valor rs', 'valor brl'],
  credit: ['credito', 'creditos', 'entrada', 'entradas', 'receita', 'valor credito', 'credit'],
  debit: ['debito', 'debitos', 'saida', 'saidas', 'despesa', 'valor debito', 'debit'],
  description: [
    'descricao',
    'historico',
    'lancamento',
    'title',
    'titulo',
    'memo',
    'detalhes',
    'estabelecimento',
    'description',
    'descricao do lancamento',
    'complemento',
  ],
  type: ['tipo', 'natureza', 'd c', 'c d', 'dc', 'cd', 'type'],
}

const IGNORED_HEADERS = ['saldo', 'balance', 'identificador', 'id', 'documento', 'n documento', 'categoria', 'category']

function headerKey(cell: string): string {
  return fold(cell)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function roleOfHeader(cell: string): Role | null {
  const key = headerKey(cell)
  if (key === '') return null
  if (IGNORED_HEADERS.some((h) => key === h || key.startsWith(`${h} `))) return 'ignore'
  for (const [role, names] of Object.entries(HEADER_SYNONYMS) as [Exclude<Role, 'ignore'>, readonly string[]][]) {
    if (names.includes(key)) return role
  }
  // "Data da compra", "Valor (R$)", "Descrição detalhada".
  if (key.startsWith('data ')) return 'date'
  if (key.startsWith('valor ')) return 'amount'
  if (key.startsWith('descricao ') || key.startsWith('historico ')) return 'description'
  return null
}

/** Separa o texto em linhas e campos, respeitando aspas (inclusive quebra de linha entre aspas). */
export function tokenize(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let quoted = false

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"' && field.trim() === '') {
      quoted = true
      field = ''
    } else if (ch === delimiter) {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += ch
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ''))
}

const DELIMITERS = [';', ',', '\t', '|'] as const

/** O delimitador que dá o maior número de linhas com a mesma quantidade (≥2) de campos. */
export function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 40).join('\n')
  let best: string = ','
  let bestScore = -1

  for (const delimiter of DELIMITERS) {
    const counts = tokenize(sample, delimiter).map((r) => r.length)
    const freq = new Map<number, number>()
    for (const c of counts) if (c >= 2) freq.set(c, (freq.get(c) ?? 0) + 1)
    const score = Math.max(0, ...freq.values())
    if (score > bestScore) {
      best = delimiter
      bestScore = score
    }
  }
  return best
}

interface Columns {
  date: number
  amount: number | null
  credit: number | null
  debit: number | null
  description: number[]
  type: number | null
}

function columnsFromHeader(header: readonly string[]): Columns | null {
  const roles = header.map(roleOfHeader)
  const first = (role: Role) => {
    const i = roles.indexOf(role)
    return i === -1 ? null : i
  }
  const date = first('date')
  const amount = first('amount')
  const credit = first('credit')
  const debit = first('debit')
  if (date === null || (amount === null && credit === null && debit === null)) return null

  const description = roles.flatMap((r, i) => (r === 'description' ? [i] : []))
  // Sem coluna de descrição com nome conhecido: toda coluna sem papel vira descrição.
  const fallback = roles.flatMap((r, i) => (r === null ? [i] : []))

  return {
    date,
    amount,
    credit,
    debit,
    description: description.length > 0 ? description : fallback,
    type: first('type'),
  }
}

function ratio<T>(values: readonly T[], test: (v: T) => boolean): number {
  if (values.length === 0) return 0
  return values.filter(test).length / values.length
}

/** Sem cabeçalho: cada coluna é julgada pelo que tem dentro. */
function columnsFromContent(rows: readonly string[][]): Columns | null {
  const width = Math.max(0, ...rows.map((r) => r.length))
  const col = (i: number) => rows.map((r) => r[i] ?? '').filter((c) => c !== '')

  let date: number | null = null
  let bestDate = 0.6
  for (let i = 0; i < width; i += 1) {
    const r = ratio(col(i), (c) => parseStatementDate(c, { anchored: true }) !== null)
    if (r > bestDate) {
      bestDate = r
      date = i
    }
  }
  if (date === null) return null

  let amount: number | null = null
  let bestAmount = 0.6
  for (let i = 0; i < width; i += 1) {
    if (i === date) continue
    const r = ratio(col(i), (c) => parseStatementAmount(c, { lenient: true }) !== null)
    if (r > bestAmount) {
      bestAmount = r
      amount = i
    }
  }
  if (amount === null) return null

  let description: number | null = null
  let longest = 0
  for (let i = 0; i < width; i += 1) {
    if (i === date || i === amount) continue
    const values = col(i)
    const avg = values.reduce((sum, v) => sum + v.length, 0) / Math.max(1, values.length)
    if (avg > longest) {
      longest = avg
      description = i
    }
  }

  return { date, amount, credit: null, debit: null, description: description === null ? [] : [description], type: null }
}

/** Coluna "tipo" só manda no sentido quando os valores dela são C/D ou crédito/débito. */
function kindFromType(value: string): EntryKind | null {
  const f = headerKey(value)
  if (/^(c|cr|credito|entrada|receita|credit|in)$/.test(f)) return 'income'
  if (/^(d|db|debito|saida|despesa|debit|out)$/.test(f)) return 'expense'
  return null
}

export interface CsvParse {
  rows: ParsedRow[]
  skipped: number
  /** `true` quando o sentido de nenhuma linha veio do arquivo (todos os valores positivos). */
  allInferred: boolean
}

export function parseCsv(input: string): CsvParse {
  const text = input.replace(/^﻿/, '')
  const table = tokenize(text, detectDelimiter(text))

  let headerIndex = -1
  let columns: Columns | null = null
  for (let i = 0; i < Math.min(15, table.length); i += 1) {
    const found = columnsFromHeader(table[i] ?? [])
    if (found) {
      headerIndex = i
      columns = found
      break
    }
  }
  const body = table.slice(headerIndex + 1)
  columns ??= columnsFromContent(body)
  if (!columns) return { rows: [], skipped: body.length, allInferred: false }

  const headerWidth = headerIndex >= 0 ? (table[headerIndex]?.length ?? 0) : 0
  const cols = columns

  // Coluna única de valor com algum negativo: o sinal é a convenção do arquivo, e positivo
  // quer dizer entrada. Tudo positivo e nenhuma outra pista: o sentido é deduzido pelo texto.
  const signedAmounts =
    cols.amount !== null &&
    body.some((r) => (parseStatementAmount(r[cols.amount ?? 0] ?? '', { lenient: true })?.cents ?? 0) < 0)

  const rows: ParsedRow[] = []
  let skipped = 0

  for (const original of body) {
    let cells = original
    // Vírgula sem aspas dentro da descrição: o excesso de campos volta para a descrição.
    if (headerWidth > 0 && cells.length > headerWidth && cols.description.length > 0) {
      const at = cols.description[0] ?? 0
      const extra = cells.length - headerWidth
      cells = [
        ...cells.slice(0, at),
        cells.slice(at, at + extra + 1).join(', '),
        ...cells.slice(at + extra + 1),
      ]
    }

    const occurredOn = parseStatementDate(cells[cols.date] ?? '', { anchored: true })
    const description = cols.description
      .map((i) => cells[i] ?? '')
      .filter((c) => c !== '')
      .join(' - ')

    let cents: number | null = null
    let declared: EntryKind | null = null

    if (cols.amount !== null) {
      const parsed = parseStatementAmount(cells[cols.amount] ?? '', { lenient: true })
      if (parsed) {
        cents = parsed.cents
        if (parsed.explicitSign || signedAmounts) declared = parsed.cents < 0 ? 'expense' : 'income'
      }
    }
    if (cents === null || cents === 0) {
      const credit = cols.credit !== null ? parseStatementAmount(cells[cols.credit] ?? '', { lenient: true }) : null
      const debit = cols.debit !== null ? parseStatementAmount(cells[cols.debit] ?? '', { lenient: true }) : null
      if (credit && credit.cents !== 0) {
        cents = Math.abs(credit.cents)
        declared = 'income'
      } else if (debit && debit.cents !== 0) {
        cents = -Math.abs(debit.cents)
        declared = 'expense'
      }
    }
    if (cols.type !== null) {
      const fromType = kindFromType(cells[cols.type] ?? '')
      if (fromType) declared = fromType
    }

    if (!occurredOn || cents === null || description === '' || isSummaryText(description)) {
      skipped += 1
      continue
    }

    const row = buildRow({ index: rows.length, occurredOn, cents, declaredKind: declared, original: description })
    if (row) rows.push(row)
    else skipped += 1
  }

  return { rows, skipped, allInferred: rows.length > 0 && rows.every((r) => r.kindInferred) }
}
