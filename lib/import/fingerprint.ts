import { fold } from './dates'
import type { KeyedRow, ParsedRow } from './types'

/**
 * A chave que impede importar o mesmo lançamento duas vezes. v1.0 — 2026-09-27.
 *
 * `sha256(data | tipo | centavos | texto original só com letras e números | ordinal)`.
 *
 * - **Só letras e números** do texto original: o PDF quebra "25.128.908/0001-06" em duas
 *   linhas e o CSV não; o CSV guarda "DL          *99" e o PDF "DL *99". Sem espaço e sem
 *   pontuação os dois viram a mesma coisa — e o mesmo extrato importado em CSV e depois em
 *   PDF gera as **mesmas** chaves.
 * - **Ordinal**: duas corridas de R$ 4,69 no mesmo dia com o mesmo texto são dois
 *   lançamentos. O primeiro leva 1, o segundo 2, na ordem do extrato — que é a mesma nos
 *   dois formatos.
 *
 * A chave vai para `entries.import_key`, com índice único por pessoa (migration 0016).
 * Nada do texto viaja nela: é um hash, e o texto já está na Observação.
 */

export function canonicalText(original: string): string {
  return fold(original).replace(/[^a-z0-9]/g, '')
}

function baseOf(row: ParsedRow): string {
  return `${row.occurredOn}|${row.kind}|${row.amountCents}|${canonicalText(row.original)}`
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** A string que vira hash, já com o ordinal. Exportada para os testes. */
export function keySources(rows: readonly ParsedRow[]): string[] {
  const seen = new Map<string, number>()
  return rows.map((row) => {
    const base = baseOf(row)
    const ordinal = (seen.get(base) ?? 0) + 1
    seen.set(base, ordinal)
    return `${base}|${ordinal}`
  })
}

export async function withImportKeys(rows: readonly ParsedRow[]): Promise<KeyedRow[]> {
  const sources = keySources(rows)
  const keys = await Promise.all(sources.map(sha256Hex))
  return rows.map((row, index) => ({ ...row, importKey: keys[index] ?? '' }))
}

export const IMPORT_KEY_RE = /^[0-9a-f]{64}$/
