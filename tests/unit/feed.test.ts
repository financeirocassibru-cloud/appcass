import { describe, expect, it } from 'vitest'
import {
  compareFeed,
  createdDay,
  createdTime,
  feedCursor,
  mergeByCreatedAt,
  parseFeedCursor,
  type FeedItemBase,
} from '@/lib/feed'

/** "Ver lançamentos" (v1.0 — 2026-09-27): ordem de criação, dia no fuso do app, cursor. */

const ID_A = '00000000-0000-0000-0000-00000000000a'
const ID_B = '00000000-0000-0000-0000-00000000000b'
const ID_C = '00000000-0000-0000-0000-00000000000c'

function item(type: FeedItemBase['type'], id: string, createdAt: string): FeedItemBase {
  return { type, id, createdAt }
}

describe('mergeByCreatedAt', () => {
  it('intercala as três origens pela criação, mais recente primeiro', () => {
    const merged = mergeByCreatedAt(
      [
        [item('entry', ID_A, '2026-09-27T12:00:00+00:00'), item('entry', ID_B, '2026-09-25T12:00:00+00:00')],
        [item('recurring', ID_C, '2026-09-26T12:00:00+00:00')],
        [],
      ],
      10,
    )
    expect(merged.map((m) => m.id)).toEqual([ID_A, ID_C, ID_B])
  })

  it('corta nas N mais recentes', () => {
    const merged = mergeByCreatedAt(
      [[item('entry', ID_A, '2026-09-27T12:00:00+00:00')], [item('installment', ID_B, '2026-09-28T12:00:00+00:00')]],
      1,
    )
    expect(merged.map((m) => m.id)).toEqual([ID_B])
  })

  it('distingue microssegundos, que o Date sozinho não vê', () => {
    const older = item('entry', ID_C, '2026-09-27T12:00:00.123001+00:00')
    const newer = item('entry', ID_A, '2026-09-27T12:00:00.123002+00:00')
    expect(mergeByCreatedAt([[older, newer]], 2).map((m) => m.id)).toEqual([ID_A, ID_C])
  })

  it('no mesmo instante, desempata pelo id decrescente — como o banco', () => {
    const same = '2026-09-27T12:00:00.5+00:00'
    const sorted = [item('entry', ID_A, same), item('entry', ID_C, same), item('entry', ID_B, same)].sort(compareFeed)
    expect(sorted.map((m) => m.id)).toEqual([ID_C, ID_B, ID_A])
  })
})

describe('createdDay', () => {
  it('usa o dia de São Paulo, não o de UTC', () => {
    // 01:30 UTC do dia 28 ainda é 22:30 do dia 27 em São Paulo.
    expect(createdDay('2026-09-28T01:30:00+00:00')).toBe('2026-09-27')
    expect(createdTime('2026-09-28T01:30:00+00:00')).toBe('22:30')
    expect(createdDay('2026-09-28T03:00:00+00:00')).toBe('2026-09-28')
  })
})

describe('feedCursor', () => {
  it('ida e volta', () => {
    const cursor = feedCursor(item('entry', ID_A, '2026-09-27T12:00:00.123456+00:00'))
    expect(parseFeedCursor(cursor)).toEqual({ createdAt: '2026-09-27T12:00:00.123456+00:00', id: ID_A })
  })

  it('recusa cursor malformado', () => {
    expect(parseFeedCursor(undefined)).toBeNull()
    expect(parseFeedCursor('lixo')).toBeNull()
    expect(parseFeedCursor('2026-09-27T12:00:00Z~nao-e-uuid')).toBeNull()
    expect(parseFeedCursor(`nao-e-data~${ID_A}`)).toBeNull()
  })
})
