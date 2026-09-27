import {
  decodeText,
  ImportError,
  isPdfBytes,
  MAX_IMPORT_BYTES,
  parseCsvStatement,
  parsePdfStatement,
  type ParseResult,
  type PdfPage,
  type TextItem,
} from './index'

/**
 * Abre o arquivo do extrato **no navegador**. v1.0 — 2026-09-27.
 *
 * O arquivo é lido para a memória, convertido em texto e descartado. Ele não é enviado ao
 * servidor nem guardado no banco: o que sai daqui são as linhas já entendidas, e só as que a
 * pessoa confirmar viram lançamento.
 *
 * O leitor de PDF (`unpdf`, que embute o pdf.js) é carregado sob demanda, só quando a pessoa
 * escolhe um PDF — ele é grande, e o Início não precisa pagar esse peso a cada abertura.
 */

async function pdfPages(bytes: Uint8Array): Promise<PdfPage[]> {
  const { getDocumentProxy } = await import('unpdf')
  let document
  try {
    document = await getDocumentProxy(bytes)
  } catch {
    throw new ImportError('Não consegui abrir este PDF. Ele pode estar protegido por senha ou corrompido.')
  }

  const pages: PdfPage[] = []
  for (let n = 1; n <= document.numPages; n += 1) {
    const page = await document.getPage(n)
    const viewport = page.getViewport({ scale: 1 })
    const content = await page.getTextContent()
    const items: TextItem[] = []
    for (const item of content.items) {
      if (!('str' in item)) continue
      const transform = item.transform as number[]
      items.push({ str: item.str, x: transform[4] ?? 0, y: transform[5] ?? 0, width: item.width })
    }
    pages.push({ height: viewport.height, items })
    page.cleanup()
  }
  await document.cleanup()
  return pages
}

export async function readStatementFile(file: File): Promise<ParseResult> {
  if (file.size > MAX_IMPORT_BYTES) {
    throw new ImportError('O arquivo passa de 10 MB. Exporte um período menor.')
  }
  const bytes = new Uint8Array(await file.arrayBuffer())

  if (isPdfBytes(bytes)) {
    return parsePdfStatement(await pdfPages(bytes), file.name)
  }
  if (/\.pdf$/i.test(file.name)) {
    throw new ImportError('Este arquivo diz ser PDF, mas não é um PDF válido.')
  }
  return parseCsvStatement(decodeText(bytes), file.name)
}
