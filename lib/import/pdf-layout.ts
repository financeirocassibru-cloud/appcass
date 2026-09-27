import type { ISODate } from '@/lib/finance/date'
import { buildRow, isSummaryText } from './build'
import { fold, parseStatementDate } from './dates'
import { squash } from './describe'
import { parseStatementAmount } from './money'
import type { EntryKind, ParsedRow, StatementTotals, TextItem } from './types'

/**
 * Do texto posicionado do PDF para lançamentos. v1.0 — 2026-09-27.
 *
 * O PDF não tem tabela: tem pedaços de texto com coordenadas. Este módulo refaz a leitura
 * que um olho humano faz, e evita de propósito depender de coordenadas fixas:
 *
 * 1. **linhas** saem de agrupar por `y`; **células**, de separar por vão horizontal;
 * 2. **cabeçalho e rodapé** são as linhas idênticas que se repetem na faixa de cima ou de
 *    baixo de várias páginas — qualquer banco, sem lista de frases;
 * 3. uma **máquina de estados** anda pelas linhas: célula que é data muda o dia; "Total de
 *    entradas/saídas" muda o sentido do grupo; linha com texto e valor abre um lançamento;
 *    linha só com texto, logo abaixo, continua a descrição — inclusive na página seguinte;
 * 4. as **colunas de cada lançamento** (tipo e detalhe) são descobertas pelo `x` do próprio
 *    lançamento. A tabela inteira pode andar para o lado que a leitura não muda.
 *
 * O sentido (entrada/saída) vem, nesta ordem: do sinal escrito no valor, do grupo em que a
 * linha está, da coluna crédito/débito quando o cabeçalho as tem, e só por último de
 * palavra-chave — marcado como deduzido, para a tela pedir conferência.
 */

export interface PdfPage {
  height: number
  items: TextItem[]
}

interface Cell {
  text: string
  x: number
  right: number
}

interface Line {
  page: number
  y: number
  cells: Cell[]
  text: string
}

/** Largura de um item quando o extrator não informou. Uma média de fonte de 9pt. */
function widthOf(item: TextItem): number {
  return item.width > 0 ? item.width : item.str.length * 4.6
}

function toLines(page: PdfPage, pageIndex: number): Line[] {
  const items = page.items.filter((i) => i.str.trim() !== '').sort((a, b) => b.y - a.y || a.x - b.x)

  const groups: TextItem[][] = []
  for (const item of items) {
    const current = groups.at(-1)
    const anchor = current?.[0]
    if (current && anchor && Math.abs(anchor.y - item.y) <= 2.5) current.push(item)
    else groups.push([item])
  }

  return groups.map((group) => {
    const sorted = [...group].sort((a, b) => a.x - b.x)
    const cells: Cell[] = []
    for (const item of sorted) {
      const last = cells.at(-1)
      const gap = last ? item.x - last.right : Infinity
      // O pdf.js já junta as palavras de um mesmo trecho num item só. Item separado é,
      // quase sempre, coluna separada — mesmo com vão pequeno: no Nubank, "Valor adicionado
      // na conta por cartão" termina a 3,6pt da coluna de detalhe. Só um vão menor que um
      // espaço (estilo trocado no meio da palavra) é emendado.
      if (last && gap < 1.5) {
        last.text = `${last.text}${gap > 1 ? ' ' : ''}${item.str}`
        last.right = Math.max(last.right, item.x + widthOf(item))
      } else {
        cells.push({ text: item.str, x: item.x, right: item.x + widthOf(item) })
      }
    }
    const clean = cells.map((c) => ({ ...c, text: squash(c.text) })).filter((c) => c.text !== '')
    return {
      page: pageIndex,
      y: group[0]?.y ?? 0,
      cells: clean,
      text: clean.map((c) => c.text).join(' '),
    }
  })
}

const PAGE_NUMBER = /^(p[aá]gina\s*)?\d+\s*(de|of|\/)\s*\d+$/i

/** Linhas de cabeçalho/rodapé: repetidas, idênticas, na faixa das margens. */
function marginLines(pages: readonly Line[][], heights: readonly number[]): Set<string> {
  if (pages.length < 2) return new Set()
  const counts = new Map<string, number>()
  pages.forEach((lines, p) => {
    const height = heights[p] ?? 842
    const seen = new Set<string>()
    for (const line of lines) {
      const inMargin = line.y > height * 0.8 || line.y < height * 0.2
      if (inMargin && !seen.has(line.text)) {
        seen.add(line.text)
        counts.set(line.text, (counts.get(line.text) ?? 0) + 1)
      }
    }
  })
  const threshold = Math.max(2, Math.ceil(pages.length / 2))
  return new Set([...counts].filter(([, n]) => n >= threshold).map(([text]) => text))
}

/** Espaçamento típico entre linhas, para saber quando um vão encerra o lançamento. */
function typicalSpacing(pages: readonly Line[][]): number {
  const freq = new Map<number, number>()
  for (const lines of pages) {
    for (let i = 1; i < lines.length; i += 1) {
      const gap = Math.round((lines[i - 1]?.y ?? 0) - (lines[i]?.y ?? 0))
      if (gap >= 6 && gap <= 40) freq.set(gap, (freq.get(gap) ?? 0) + 1)
    }
  }
  let best = 14
  let bestCount = 0
  for (const [gap, count] of freq) {
    if (count > bestCount) {
      best = gap
      bestCount = count
    }
  }
  return best
}

function groupKind(text: string): EntryKind | null {
  const f = fold(text)
  // Só "Total de …" ou a palavra sozinha. Um prefixo solto pegaria a continuação de uma
  // descrição — "PAGAMENTOS - IP (0260) Agência…" já virou o sinal do grupo assim.
  if (/^total (de |das? )?(entradas|creditos|recebimentos|depositos)\b/.test(f)) return 'income'
  if (/^total (de |das? )?(saidas|debitos|pagamentos|gastos|despesas)\b/.test(f)) return 'expense'
  if (/^(entradas|creditos)$/.test(f)) return 'income'
  if (/^(saidas|debitos)$/.test(f)) return 'expense'
  return null
}

/** Colunas nomeadas num cabeçalho de tabela ("Data | Histórico | Valor | Saldo"). */
interface HeaderColumns {
  value: number | null
  balance: number | null
  credit: number | null
  debit: number | null
}

function readHeader(line: Line): HeaderColumns | null {
  const roles = line.cells.map((c) => fold(c.text).replace(/[^a-z ]/g, '').trim())
  const center = (c: Cell) => (c.x + c.right) / 2
  const find = (re: RegExp) => {
    const i = roles.findIndex((r) => re.test(r))
    const cell = i === -1 ? undefined : line.cells[i]
    return cell ? center(cell) : null
  }
  const hasLabel = roles.some((r) => /^(data|historico|descricao|lancamento)/.test(r))
  if (!hasLabel || line.cells.length < 3) return null
  const header = {
    value: find(/^valor/),
    balance: find(/^saldo/),
    credit: find(/^(credito|entrada)/),
    debit: find(/^(debito|saida)/),
  }
  return header.value ?? header.balance ?? header.credit ?? header.debit ? header : null
}

interface Pending {
  occurredOn: ISODate
  cents: number
  declared: EntryKind | null
  title: string[]
  details: string[]
  titleX: number
  detailX: number | null
  page: number
  y: number
}

export interface PdfParse {
  rows: ParsedRow[]
  statementTotals: StatementTotals | null
  period: { from: ISODate; to: ISODate } | null
  bankHint: string | null
  /** Quantas linhas tinham texto — distingue "PDF sem texto" de "layout não reconhecido". */
  textLines: number
}

function detectBank(text: string): string | null {
  const f = fold(text)
  if (/nubank|nu pagamentos/.test(f)) return 'Nubank'
  if (/banco inter\b|bancointer/.test(f)) return 'Inter'
  if (/itau/.test(f)) return 'Itaú'
  if (/bradesco/.test(f)) return 'Bradesco'
  if (/santander/.test(f)) return 'Santander'
  if (/caixa economica/.test(f)) return 'Caixa'
  if (/banco do brasil/.test(f)) return 'Banco do Brasil'
  if (/c6 bank/.test(f)) return 'C6 Bank'
  if (/picpay/.test(f)) return 'PicPay'
  if (/mercado pago/.test(f)) return 'Mercado Pago'
  return null
}

export function parsePdfPages(pages: readonly PdfPage[]): PdfParse {
  const linesByPage = pages.map((p, i) => toLines(p, i))
  const margins = marginLines(linesByPage, pages.map((p) => p.height))
  const spacing = typicalSpacing(linesByPage.map((lines) => lines.filter((l) => !margins.has(l.text))))
  const allLines = linesByPage.flat()

  // Período: a primeira linha com duas datas completas. Dá o ano às datas que vêm sem ano.
  let period: PdfParse['period'] = null
  for (const line of allLines) {
    const dates = line.cells
      .map((c) => parseStatementDate(c.text, { anchored: true }))
      .filter((d): d is ISODate => d !== null)
    const [from, to] = dates
    if (from && to && dates.length === 2) {
      period = from <= to ? { from, to } : { from: to, to: from }
      break
    }
  }
  const fallbackYear = period ? Number(period.to.slice(0, 4)) : undefined

  const bankHint = detectBank([...margins].join(' ')) ?? detectBank(allLines.slice(0, 12).map((l) => l.text).join(' '))

  const rows: ParsedRow[] = []
  const totals: StatementTotals = { incomeCents: null, expenseCents: null }
  let header: HeaderColumns | null = null
  let currentDate: ISODate | null = null
  let group: EntryKind | null = null
  let pending: Pending | null = null
  let lastPage = -1
  let firstLinesOfPage = 0

  const flush = () => {
    if (!pending) return
    const title = squash(pending.title.join(' '))
    const details = squash(pending.details.join(' '))
    const original = details ? `${title} - ${details}` : title
    const row = buildRow({
      index: rows.length,
      occurredOn: pending.occurredOn,
      cents: pending.cents,
      declaredKind: pending.declared,
      original,
    })
    if (row) rows.push(row)
    pending = null
  }

  for (const line of allLines) {
    if (line.page !== lastPage) {
      lastPage = line.page
      firstLinesOfPage = 0
    }
    if (margins.has(line.text) || PAGE_NUMBER.test(line.text)) continue
    firstLinesOfPage += 1

    const found = readHeader(line)
    if (found) {
      header = found
      flush()
      continue
    }

    let cells = line.cells
    const dateCells = cells.filter((c) => parseStatementDate(c.text, { anchored: true, fallbackYear }))
    if (dateCells.length >= 2) continue // o período, repetido

    const first = cells[0]
    const leadingDate = first ? parseStatementDate(first.text, { anchored: true, fallbackYear }) : null
    if (leadingDate) {
      flush()
      currentDate = leadingDate
      group = null
      cells = cells.slice(1)
      if (cells.length === 0) continue
    }

    // O valor é a célula mais à direita que é só dinheiro — e não é a coluna de saldo.
    const amountCells = cells.filter((c) => parseStatementAmount(c.text) !== null)
    const center = (c: Cell) => (c.x + c.right) / 2
    const candidates = amountCells.filter((c) => {
      if (!header || header.balance === null) return true
      const toBalance = Math.abs(center(c) - header.balance)
      const toValue = Math.min(
        ...[header.value, header.credit, header.debit].filter((v): v is number => v !== null).map((v) => Math.abs(center(c) - v)),
        Infinity,
      )
      return toValue < toBalance
    })
    const amountCell = candidates[0] ?? null
    const textCells = cells.filter((c) => !amountCells.includes(c))
    const text = textCells.map((c) => c.text).join(' ')

    const kindOfGroup = text ? groupKind(text) : null
    if (kindOfGroup) {
      flush()
      const amount = amountCell ? parseStatementAmount(amountCell.text) : null
      if (currentDate === null && amount) {
        // Resumo do topo, antes do primeiro dia: é o total que o extrato declara.
        if (kindOfGroup === 'income') totals.incomeCents = Math.abs(amount.cents)
        else totals.expenseCents = Math.abs(amount.cents)
      } else {
        group = kindOfGroup
      }
      continue
    }

    if (text && isSummaryText(text)) {
      flush()
      continue
    }

    const firstText = textCells[0]

    if (amountCell && firstText && currentDate) {
      flush()
      const amount = parseStatementAmount(amountCell.text)
      if (!amount) continue

      let declared: EntryKind | null = null
      if (amount.explicitSign) declared = amount.cents < 0 ? 'expense' : 'income'
      else if (group) declared = group
      else if (header && (header.credit !== null || header.debit !== null)) {
        const toCredit = header.credit === null ? Infinity : Math.abs(center(amountCell) - header.credit)
        const toDebit = header.debit === null ? Infinity : Math.abs(center(amountCell) - header.debit)
        declared = toCredit < toDebit ? 'income' : 'expense'
      }

      pending = {
        occurredOn: currentDate,
        cents: amount.cents,
        declared,
        title: [firstText.text],
        details: textCells.slice(1).map((c) => c.text),
        titleX: firstText.x,
        detailX: textCells[1]?.x ?? null,
        page: line.page,
        y: line.y,
      }
      continue
    }

    if (!amountCell && pending && textCells.length > 0) {
      const samePage = line.page === pending.page
      const close = samePage ? pending.y - line.y <= spacing * 1.6 : firstLinesOfPage <= 3
      const aligned = textCells.every((c) => c.x >= pending!.titleX - 4)
      if (close && aligned) {
        for (const cell of textCells) {
          const toTitle = Math.abs(cell.x - pending.titleX)
          const toDetail = pending.detailX === null ? Infinity : Math.abs(cell.x - pending.detailX)
          if (toDetail < toTitle) pending.details.push(cell.text)
          else if (pending.detailX === null && cell.x > pending.titleX + 40) {
            pending.detailX = cell.x
            pending.details.push(cell.text)
          } else pending.title.push(cell.text)
        }
        pending.page = line.page
        pending.y = line.y
      }
      // Linha longe ou desalinhada (rodapé que sobrou, número de página) é ignorada sem
      // encerrar o lançamento: a continuação dele pode estar no topo da página seguinte.
      continue
    }
  }
  flush()

  return {
    rows,
    statementTotals: totals.incomeCents !== null || totals.expenseCents !== null ? totals : null,
    period,
    bankHint,
    textLines: allLines.length,
  }
}
