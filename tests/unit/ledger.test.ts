import { describe, expect, test } from 'bun:test'
import {
  LINE_KINDS,
  ENTRY_SOURCES,
  TENDERS,
  describeKind,
  entryForm,
  isLineKind,
  netPence,
  londonDayOf,
  totalOf,
} from '#shared/utils/ledger'

// I-101. Money is integer pence and nothing is ever edited: a correction is a new entry pointing
// at what it corrects (0004, 0010). The kind is enforced here rather than by a CHECK (0033).

describe('money is integer pence, and nothing else', () => {
  test('a line takes whole pence', () => {
    expect(entryForm.safeParse({
      source: 'DESK',
      tender: 'CARD',
      lines: [{ kind: 'TICKET_COLLECTION', amountPence: 750, qty: 1 }],
    }).success).toBe(true)
  })

  test('a fraction of a penny is refused rather than rounded', () => {
    expect(entryForm.safeParse({
      source: 'DESK',
      tender: 'CARD',
      lines: [{ kind: 'TICKET_COLLECTION', amountPence: 7.5, qty: 1 }],
    }).success).toBe(false)
  })

  test('an entry with no lines is refused: money that itemises to nothing is not a fact', () => {
    expect(entryForm.safeParse({ source: 'DESK', tender: 'CARD', lines: [] }).success).toBe(false)
  })

  test('a total is the sum of its lines, computed and never supplied', () => {
    expect(totalOf([
      { kind: 'TICKET_COLLECTION', amountPence: 750, qty: 1 },
      { kind: 'BAR_ITEM', amountPence: 350, qty: 2 },
    ])).toBe(1100)
  })

  test('a comp totals zero without pretending nothing happened', () => {
    expect(totalOf([{ kind: 'TICKET_COLLECTION', amountPence: 0, qty: 1 }])).toBe(0)
  })
})

// Criterion 3: both entries remain visible and the net is computed across the chain.
describe('a correction supersedes and never overwrites', () => {
  test('a reversal nets a collection to nothing', () => {
    expect(netPence([
      { id: 'a', totalPence: 750, reversesEntryId: null },
      { id: 'b', totalPence: -750, reversesEntryId: 'a' },
    ])).toBe(0)
  })

  test('a partial refund leaves what was kept', () => {
    expect(netPence([
      { id: 'a', totalPence: 1000, reversesEntryId: null },
      { id: 'b', totalPence: -250, reversesEntryId: 'a' },
    ])).toBe(750)
  })

  test('a second reversal of the same entry still counts, because both are facts', () => {
    expect(netPence([
      { id: 'a', totalPence: 1000, reversesEntryId: null },
      { id: 'b', totalPence: -500, reversesEntryId: 'a' },
      { id: 'c', totalPence: -500, reversesEntryId: 'a' },
    ])).toBe(0)
  })

  test('an entry cannot reverse itself', () => {
    expect(entryForm.safeParse({
      source: 'DESK',
      tender: 'CARD',
      id: 'a',
      reversesEntryId: 'a',
      lines: [{ kind: 'REFUND', amountPence: -750, qty: 1 }],
    }).success).toBe(false)
  })
})

// Criterion 5: stored in UTC, grouped by the London day, which is not the same day for six months
// of the year (0014).
describe('a day is a London day', () => {
  test('an evening in British Summer Time groups to that evening, not the next morning', () => {
    // 2026-06-15 23:30 London is 22:30 UTC.
    expect(londonDayOf(new Date('2026-06-15T22:30:00Z'))).toBe('2026-06-15')
  })

  test('the same clock time in winter groups the same way', () => {
    expect(londonDayOf(new Date('2026-01-15T23:30:00Z'))).toBe('2026-01-15')
  })

  test('an entry either side of the spring transition lands on the right day', () => {
    // 2026-03-29 01:00 UTC is 01:00 London; 02:00 UTC is 03:00 London, the clocks having gone on.
    expect(londonDayOf(new Date('2026-03-29T01:00:00Z'))).toBe('2026-03-29')
    expect(londonDayOf(new Date('2026-03-29T02:00:00Z'))).toBe('2026-03-29')
  })

  test('half past midnight London in summer is the new day, though it is still the old one in UTC', () => {
    expect(londonDayOf(new Date('2026-06-15T23:30:00Z'))).toBe('2026-06-16')
  })
})

describe('the kind is a closed set held in code (0033)', () => {
  test('the kinds the estate posts are all registered', () => {
    for (const kind of ['TICKET_COLLECTION', 'WALK_UP', 'BAR_ITEM', 'PASS_SALE', 'TAB_SETTLEMENT', 'REFUND', 'IMPORT']) {
      expect(isLineKind(kind)).toBe(true)
    }
  })

  test('one nobody registered is refused at the write path', () => {
    expect(isLineKind('MEMBERSHIP')).toBe(false)
    expect(entryForm.safeParse({
      source: 'DESK',
      tender: 'CARD',
      lines: [{ kind: 'MEMBERSHIP', amountPence: 500, qty: 1 }],
    }).success).toBe(false)
  })

  // A report groups by kind, so an unregistered one must not fall out of a total silently.
  test('a reader of an unregistered kind still gets something to show', () => {
    expect(describeKind('TICKET_COLLECTION')).toBe('Ticket collection')
    expect(describeKind('SOMETHING_NEW')).toBe('SOMETHING_NEW')
  })

  test('source and tender stay closed sets, because the database holds them too', () => {
    expect([...ENTRY_SOURCES]).toEqual(['DESK', 'TILL', 'SELF_SERVE', 'IMPORT', 'SYSTEM'])
    expect([...TENDERS]).toEqual(['CARD', 'COMP', 'TAB', 'NONE'])
    expect(LINE_KINDS.length).toBeGreaterThan(0)
  })
})
