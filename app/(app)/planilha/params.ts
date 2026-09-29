import type { Route } from 'next'
import type { SheetPatch } from '@/components/finance/sheet/sheet-toolbar'
import { addMonths, endOfMonth, isISODate, startOfMonth, todayISO, type ISODate } from '@/lib/finance/date'
import { analysisPeriodRange } from '@/lib/finance/periods'
import { MAX_SHEET_MONTHS, type SheetGrouping, type SheetSort } from '@/lib/finance/sheet'

/**
 * Os parâmetros da planilha, lidos da URL. v1.0 — 28/09/2026 (Fase 14).
 *
 * Nomes em português na URL (`de`, `ate`, `agrupar`, `ordem`, `cenario`), como a Análise; o
 * padrão é **Próximos 12 meses**. O período escolhido aqui não vira o padrão da Análise: são
 * telas com perguntas diferentes, e a planilha não mexe no perfil.
 *
 * Toda data passa por `isISODate` antes de qualquer conta de calendário — uma data inválida
 * digitada à mão cai no padrão em vez de derrubar o Server Component.
 */

export interface RawSheetParams {
  de?: string
  ate?: string
  agrupar?: string
  ordem?: string
  cenario?: string
}

export interface SheetParams {
  from: ISODate
  to: ISODate
  grouping: SheetGrouping
  sort: SheetSort
  scenarioId: string | undefined
}

const GROUPINGS: Record<string, SheetGrouping> = { categoria: 'category', nao: 'none' }
const SORTS: Record<string, SheetSort> = { lancamento: 'created', data: 'occurred', nome: 'alpha' }

/** O rótulo na URL — o caminho de volta. */
export const GROUPING_PARAM: Record<SheetGrouping, string> = { category: 'categoria', none: 'nao' }
export const SORT_PARAM: Record<SheetSort, string> = { created: 'lancamento', occurred: 'data', alpha: 'nome' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function parseSheetParams(raw: RawSheetParams, today: ISODate = todayISO()): SheetParams {
  const fallback = analysisPeriodRange('next_12m', today)
  const from = raw.de && isISODate(raw.de) ? raw.de : fallback.from
  const requestedTo = raw.ate && isISODate(raw.ate) ? raw.ate : fallback.to
  const validFrom = from <= requestedTo ? from : fallback.from
  // Teto de colunas: `?de=1900-01-01` pediria um século de meses.
  const ceiling = endOfMonth(addMonths(startOfMonth(validFrom), MAX_SHEET_MONTHS - 1))
  const to = from <= requestedTo ? (requestedTo > ceiling ? ceiling : requestedTo) : fallback.to

  return {
    from: validFrom,
    to,
    grouping: (raw.agrupar ? GROUPINGS[raw.agrupar] : undefined) ?? 'category',
    sort: (raw.ordem ? SORTS[raw.ordem] : undefined) ?? 'alpha',
    scenarioId: raw.cenario && UUID.test(raw.cenario) ? raw.cenario : undefined,
  }
}

/** Um link para a planilha (ou a do cartão) preservando o que já está na URL. */
export function sheetHref(
  base: '/planilha' | `/planilha/cartao/${string}`,
  current: RawSheetParams,
  overrides: Partial<Record<keyof RawSheetParams, string | undefined>>,
): Route {
  const query = new URLSearchParams()
  const merged = { ...current, ...overrides }
  for (const key of ['de', 'ate', 'agrupar', 'ordem', 'cenario'] as const) {
    const value = merged[key]
    if (value) query.set(key, value)
  }
  const search = query.toString()
  return (search ? `${base}?${search}` : base) as Route
}

/** O que um controle da barra troca, com os nomes da URL. */
export function patchToRaw(patch: SheetPatch): Partial<Record<keyof RawSheetParams, string | undefined>> {
  const raw: Partial<Record<keyof RawSheetParams, string | undefined>> = {}
  if (patch.from !== undefined) raw.de = patch.from
  if (patch.to !== undefined) raw.ate = patch.to
  if (patch.grouping !== undefined) raw.agrupar = GROUPING_PARAM[patch.grouping]
  if (patch.sort !== undefined) raw.ordem = SORT_PARAM[patch.sort]
  if (patch.scenarioId !== undefined) raw.cenario = patch.scenarioId ?? undefined
  return raw
}
