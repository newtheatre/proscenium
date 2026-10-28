import { describe, expect, test } from 'bun:test'
import { boardEntries, boardNights, openingsOnNightHref } from '#shared/utils/rota-board'
import { parseCondition } from '#shared/utils/list-filters'
import { rotaOpeningsList } from '#shared/utils/rota-openings-list'

// Bar openings on the rota board (E-130 criterion 8, issue 1216): one list ordered by when each
// evening starts, an opening marked as one, and a link to where it is staffed.

const performance = (performanceId: string, startsAt: number) => ({ performanceId, startsAt, shifts: [] })
const opening = (openingId: string, startsAt: number) => ({ openingId, startsAt, night: '2026-09-25', shifts: [] })

describe('the board orders openings among performances by when they start', () => {
  test('an opening between two performances sits between them', () => {
    const entries = boardEntries([performance('p1', 100), performance('p2', 300)], [opening('o1', 200)])
    expect(entries.map(entry => entry.kind)).toEqual(['performance', 'opening', 'performance'])
  })

  test('each entry says which it is, so the card can be told apart', () => {
    const [first, second] = boardEntries([performance('p1', 100)], [opening('o1', 50)])
    expect(first).toMatchObject({ kind: 'opening', openingId: 'o1' })
    expect(second).toMatchObject({ kind: 'performance', performanceId: 'p1' })
  })

  test('a performance and an opening starting together put the performance first', () => {
    const entries = boardEntries([performance('p1', 100)], [opening('o1', 100)])
    expect(entries.map(entry => entry.kind)).toEqual(['performance', 'opening'])
  })

  test('a window with no openings is the performances as they were', () => {
    const entries = boardEntries([performance('p1', 100), performance('p2', 300)], [])
    expect(entries.map(entry => entry.kind)).toEqual(['performance', 'performance'])
  })

  test('a window with only openings still lists them', () => {
    expect(boardEntries([], [opening('o1', 100)])).toHaveLength(1)
  })
})

describe('an opening links to its night on the openings screen', () => {
  test('the link names the openings screen and the night', () => {
    expect(openingsOnNightHref('2026-09-25')).toBe('/rota/manage/openings?night=2026-09-25')
  })

  test('the night the link carries is one the openings list accepts', () => {
    const field = rotaOpeningsList.fields.find(candidate => candidate.key === 'night')!
    const value = new URL(openingsOnNightHref('2026-09-25'), 'https://example.invalid').searchParams.get('night')!
    expect(parseCondition(field, value)).toEqual({ condition: { key: 'night', operator: 'is', values: ['2026-09-25'] } })
  })
})

// 0252: one row per show night, so an evening's house and its bar opening are staffed together.
describe('the board reads as one row per show night', () => {
  // 18:00 London on 24 and 25 October 2026, either side of the clocks going back.
  const evening = (day: number): number => Math.floor(Date.UTC(2026, 9, day, day === 24 ? 17 : 18) / 1000)

  test('a performance and the opening after it on one evening share a night', () => {
    const entries = boardEntries([performance('p1', evening(24))], [opening('o1', evening(24) + 3 * 3600)])
    const nights = boardNights(entries)
    expect(nights).toHaveLength(1)
    expect(nights[0]!.night).toBe('2026-10-24')
    expect(nights[0]!.entries.map(entry => entry.kind)).toEqual(['performance', 'opening'])
  })

  test('an opening past midnight belongs to the evening it started on', () => {
    const lateOpening = Math.floor(Date.UTC(2026, 9, 25, 1, 30) / 1000)
    const nights = boardNights(boardEntries([performance('p1', evening(24))], [opening('o1', lateOpening)]))
    expect(nights.map(night => night.night)).toEqual(['2026-10-24'])
  })

  test('two evenings are two nights, in order', () => {
    const nights = boardNights(boardEntries([performance('p2', evening(25)), performance('p1', evening(24))], []))
    expect(nights.map(night => night.night)).toEqual(['2026-10-24', '2026-10-25'])
  })

  test('nothing on the board is no nights', () => {
    expect(boardNights([])).toEqual([])
  })
})
