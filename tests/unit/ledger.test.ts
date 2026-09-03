import { describe, expect, test } from 'bun:test'
import { AUDIT_MODULES } from '#shared/utils/audit-actions'
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
    for (const kind of ['TICKET_COLLECTION', 'WALK_UP', 'BAR_ITEM', 'PASS_SALE', 'PASS_ADMISSION', 'TAB_SETTLEMENT', 'REFUND', 'IMPORT']) {
      expect(isLineKind(kind)).toBe(true)
    }
  })

  // A pass admission is money that did not move, and it is still a fact the ledger carries
  // (D-125 criterion 5, I-102 criterion 4).
  test('a pass admission posts at zero rather than not at all', () => {
    expect(entryForm.safeParse({
      source: 'SELF_SERVE',
      tender: 'NONE',
      lines: [{ kind: 'PASS_ADMISSION', amountPence: 0, qty: 1, ticketId: 't-1', performanceId: 'p-1' }],
    }).success).toBe(true)
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

// The (source, tender, kind) triple for every money path is fixed in architecture.md, so the
// table is read here: a row naming a value the code does not hold is drift, not documentation.
describe('the money-path table agrees with the code (build order, Wave 0 b)', () => {
  interface MoneyPath { path: string, module: string, sources: string[], tenders: string[], kinds: string[] }

  const tokens = (cell: string): string[] => [...cell.matchAll(/`([A-Z_]+)`/g)].map(match => match[1]!)

  async function moneyPaths(): Promise<MoneyPath[]> {
    const source = await Bun.file('docs/architecture.md').text()
    const section = source.split('\n## Money and the ledger\n')[1]?.split('\n## ')[0] ?? ''
    return section.split('\n')
      .filter(line => line.startsWith('| ') && !line.startsWith('| Money path') && !line.startsWith('| ---'))
      .map((line) => {
        const cells = line.split('|').slice(1, -1).map(cell => cell.trim())
        const [path, , module, sources, tenders, kinds] = cells
        return { path: path!, module: module!, sources: tokens(sources!), tenders: tokens(tenders!), kinds: tokens(kinds!) }
      })
  }

  test('every path the build order names has a row', async () => {
    const named = (await moneyPaths()).map(row => row.path.toLowerCase())
    for (const path of ['desk collection', 'walk-up', 'refund', 'pass sale', 'pass admission', 'bar item', 'tab settlement', 'void', 'import']) {
      expect(named.some(candidate => candidate.includes(path))).toBe(true)
    }
  })

  test('every row uses a source, a tender and a kind the write path accepts', async () => {
    for (const row of await moneyPaths()) {
      expect(`${row.path}: ${row.sources.length > 0 && row.tenders.length > 0 && row.kinds.length > 0}`).toBe(`${row.path}: true`)
      for (const source of row.sources) expect(`${row.path}: ${source}`).toBe(`${row.path}: ${ENTRY_SOURCES.find(s => s === source)}`)
      for (const tender of row.tenders) expect(`${row.path}: ${tender}`).toBe(`${row.path}: ${TENDERS.find(t => t === tender)}`)
      for (const kind of row.kinds) expect(`${row.path}: ${isLineKind(kind)}`).toBe(`${row.path}: true`)
    }
  })

  test('every kind the code holds is posted by some path, so none is registered and never used', async () => {
    const posted = new Set((await moneyPaths()).flatMap(row => row.kinds))
    expect(LINE_KINDS.map(kind => kind.name).filter(kind => !posted.has(kind))).toEqual([])
  })

  // A money path is a privileged mutation, and its audit entries need a module to group under.
  test('every module that posts money has an audit module to write under', async () => {
    for (const row of await moneyPaths()) {
      expect(`${row.path}: ${row.module}`).toBe(`${row.path}: ${AUDIT_MODULES.find(module => module === row.module)}`)
    }
  })
})
