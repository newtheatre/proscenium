import { describe, expect, test } from 'bun:test'
import {
  currentReadingQuery,
  deskByKindQuery,
  deskForegoneQuery,
  nightsWithOpenVarianceQuery,
  nightsWithTakings,
  outstandingNights,
  readingHistoryQuery,
  takingsDaysQuery,
  zReadingStatement,
} from '#server/utils/night-reconciliation'
import { londonDayOf } from '#shared/utils/ledger'
import { fromLondonWallClock } from '#shared/utils/london'
import { FIRST_RECONCILED_NIGHT } from '#shared/utils/show-night'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { TakingsDay } from '#server/utils/night-reconciliation'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'
import type { ZReading } from '#shared/utils/night-reconciliation'

// I-104 against the real migrations, scoped to the show night (04:00 to 04:00 London), the same
// window F-118's own reconciliation reads (server/utils/reconciliation.ts), never a calendar day.

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    person(database, 'treasurer')
    await fn(database)
  }
  finally {
    database.close()
  }
}

function read<T>(database: TestDatabase, statement: SQL): T[] {
  const [query, ...parameters] = boundStatement(database, statement)
  return rows<T>(database, query, ...parameters)
}

function person(database: TestDatabase, id: string): string {
  database.batch([['INSERT OR IGNORE INTO users (id, name, email, verified) VALUES (?, ?, ?, 1)',
    id, `Someone ${id}`, `${id}@e2e.newtheatre.org.uk`]])
  return id
}

let entrySeq = 0
let lineSeq = 0

// happenedAt is always stamped explicitly: a night's window is a fact about the row, never about
// when the test happened to run (the same discipline `tests/integration/reconciliation.test.ts` keeps).
function entry(database: TestDatabase, source: string, tender: string, happenedAt: number, reverses: string | null = null, totalPence = 0): string {
  const id = `e-${++entrySeq}`
  database.batch([['INSERT INTO ledger_entries (id, london_day, source, tender, happened_at, reverses_entry_id, total_pence) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id, londonDayOf(new Date(happenedAt * 1000)), source, tender, happenedAt, reverses, totalPence]])
  return id
}

function line(database: TestDatabase, entryId: string, kind: string, amountPence: number, options: { unitPricePence?: number, discountPence?: number } = {}): void {
  database.batch([['INSERT INTO ledger_lines (id, entry_id, kind, amount_pence, unit_price_pence, discount_pence) VALUES (?, ?, ?, ?, ?, ?)',
    `l-${++lineSeq}`, entryId, kind, amountPence, options.unitPricePence ?? null, options.discountPence ?? 0]])
}

// A plain night, safely clear of any DST transition (matching F-118's own fixture constant).
const NIGHT = '2026-01-05'
const FROM_AT = Math.floor(Date.UTC(2026, 0, 5, 4, 0, 0) / 1000)
const TO_AT = Math.floor(Date.UTC(2026, 0, 6, 4, 0, 0) / 1000)

function record(database: TestDatabase, night: string, readerPence: number, expectedPence: number, options: { note?: string, supersedesId?: string, writtenOff?: boolean } = {}): string {
  const prepared = zReadingStatement(
    { night, readerPence, note: options.note, supersedesId: options.supersedesId, writtenOff: options.writtenOff ?? false },
    'treasurer',
    expectedPence,
  )
  expect(read(database, prepared.statement)).toEqual([{ id: prepared.id }])
  return prepared.id
}

describe('the night\'s expected figure, desk side (criterion 1)', () => {
  test('desk CARD lines are grouped by kind, inside the night window only', async () => {
    await withDatabase(async (database) => {
      const collection = entry(database, 'DESK', 'CARD', FROM_AT + 60)
      line(database, collection, 'PASS_SALE', 900)
      const walkUp = entry(database, 'DESK', 'CARD', TO_AT - 60)
      line(database, walkUp, 'WALK_UP', 500)
      const tab = entry(database, 'TILL', 'TAB', FROM_AT + 120)
      line(database, tab, 'BAR_ITEM', 300)
      const beforeNight = entry(database, 'DESK', 'CARD', FROM_AT - 60)
      line(database, beforeNight, 'WALK_UP', 999)
      const afterNight = entry(database, 'DESK', 'CARD', TO_AT + 60)
      line(database, afterNight, 'WALK_UP', 999)

      const byKind = read<{ kind: string, totalPence: number }>(database, deskByKindQuery(NIGHT))
      expect(byKind.sort((a, b) => a.kind.localeCompare(b.kind))).toEqual([
        { kind: 'PASS_SALE', totalPence: 900 },
        { kind: 'WALK_UP', totalPence: 500 },
      ])
    })
  })

  test('desk comps and discounts are itemised for the night, whichever tender', async () => {
    await withDatabase(async (database) => {
      const comp = entry(database, 'DESK', 'COMP', FROM_AT + 60)
      line(database, comp, 'PASS_SALE', 0, { unitPricePence: 900 })
      const discount = entry(database, 'DESK', 'CARD', FROM_AT + 120)
      line(database, discount, 'PASS_SALE', 800, { discountPence: 100 })

      const [foregone] = read<{ compsPence: number, discountsPence: number }>(database, deskForegoneQuery(NIGHT))
      expect(foregone).toEqual({ compsPence: 900, discountsPence: 100 })
    })
  })
})

describe('recording a reading (criteria 2, 3)', () => {
  test('a reading that matches the ledger needs no note', async () => {
    await withDatabase(async (database) => {
      const id = record(database, NIGHT, 0, 0)
      const [current] = read<ZReading & { writtenOff: number }>(database, currentReadingQuery(NIGHT))
      expect(current).toMatchObject({ id, readerPence: 0, expectedPence: 0, variancePence: 0, enteredByName: 'Someone treasurer' })
    })
  })

  test('a reading that disagrees is refused without a note', () => {
    expect(() => zReadingStatement({ night: NIGHT, readerPence: 5000, writtenOff: false }, 'treasurer', 0))
      .toThrow(expect.objectContaining({ statusCode: 400 }))
  })

  test('a reading that disagrees, with a note, records the variance', async () => {
    await withDatabase(async (database) => {
      const id = record(database, NIGHT, 1000, 900, { note: 'Reader ran high' })
      const [current] = read<ZReading>(database, currentReadingQuery(NIGHT))
      expect(current).toMatchObject({ id, variancePence: 100 })
    })
  })
})

describe('the resolution chain (criterion 4)', () => {
  test('a correction supersedes and the chain carries both rows', async () => {
    await withDatabase(async (database) => {
      const first = record(database, NIGHT, 1000, 900, { note: 'Typo, correcting' })
      const correction = zReadingStatement({ night: NIGHT, readerPence: 900, supersedesId: first, writtenOff: false }, 'treasurer', 900)
      expect(read(database, correction.statement)).toEqual([{ id: correction.id }])

      const [current] = read<ZReading>(database, currentReadingQuery(NIGHT))
      expect(current).toMatchObject({ id: correction.id, variancePence: 0 })

      const history = read<{ id: string }>(database, readingHistoryQuery(NIGHT))
      expect(history.map(row => row.id)).toEqual([first, correction.id])
    })
  })

  test('a write-off accepts a real variance rather than restating it as zero', async () => {
    await withDatabase(async (database) => {
      const first = record(database, NIGHT, 500, 0, { note: 'Reader ran high' })
      const writeOff = zReadingStatement(
        { night: NIGHT, readerPence: 500, supersedesId: first, writtenOff: true, note: 'Approved, not chasing further' },
        'treasurer',
        0,
      )
      expect(read(database, writeOff.statement)).toEqual([{ id: writeOff.id }])

      const [current] = read<ZReading & { writtenOff: number }>(database, currentReadingQuery(NIGHT))
      expect(current).toMatchObject({ id: writeOff.id, variancePence: 500, writtenOff: 1 })
    })
  })

  test('a write-off must name what it resolves', () => {
    expect(() => zReadingStatement({ night: NIGHT, readerPence: 500, note: 'x', writtenOff: true }, 'treasurer', 0))
      .toThrow(expect.objectContaining({ statusCode: 400 }))
  })

  test('a racing second first-reading for the same night inserts nothing', async () => {
    await withDatabase(async (database) => {
      record(database, NIGHT, 0, 0)
      const second = zReadingStatement({ night: NIGHT, readerPence: 0, writtenOff: false }, 'treasurer', 0)
      expect(read(database, second.statement)).toEqual([])
    })
  })

  test('a racing second resolution of the same reading inserts nothing', async () => {
    await withDatabase(async (database) => {
      const first = record(database, NIGHT, 500, 0, { note: 'Reader ran high' })
      const winner = zReadingStatement({ night: NIGHT, readerPence: 0, supersedesId: first, writtenOff: false }, 'treasurer', 0)
      expect(read(database, winner.statement)).toEqual([{ id: winner.id }])

      const loser = zReadingStatement({ night: NIGHT, readerPence: 500, supersedesId: first, writtenOff: true, note: 'x' }, 'treasurer', 0)
      expect(read(database, loser.statement)).toEqual([])
    })
  })
})

describe('open variances, never truncated (criterion 5)', () => {
  test('an open variance surfaces until written off', async () => {
    await withDatabase(async (database) => {
      const first = record(database, NIGHT, 500, 0, { note: 'High' })
      expect(read(database, nightsWithOpenVarianceQuery())).toEqual([{ night: NIGHT }])

      const writeOff = zReadingStatement({ night: NIGHT, readerPence: 500, supersedesId: first, writtenOff: true, note: 'Accepted' }, 'treasurer', 0)
      read(database, writeOff.statement)
      expect(read(database, nightsWithOpenVarianceQuery())).toEqual([])
    })
  })
})

// Issue #1359: the nights needing a reading come from reader takings, whatever took them, not
// from performances or till sessions; the period close warns from the same list (I-107 c5).
describe('every night with reader takings needs a reading (criterion 5)', () => {
  const at = (day: string, hour: number): number => {
    const [year, month, date] = day.split('-').map(Number) as [number, number, number]
    return Math.floor(fromLondonWallClock(year, month, date, hour).getTime() / 1000)
  }

  const taking = (database: TestDatabase, source: string, tender: string, happenedAt: number, kind: string, amountPence: number): void =>
    line(database, entry(database, source, tender, happenedAt, null, amountPence), kind, amountPence)

  function missing(database: TestDatabase, recorded: string[] = []): string[] {
    const nights = nightsWithTakings(read<TakingsDay>(database, takingsDaysQuery()))
    return outstandingNights(nights, new Set(recorded), '2026-09-26').map(row => row.night)
  }

  test('a pass-sale-only night and a tab-settlement-only night are listed, with no performance or session', async () => {
    await withDatabase(async (database) => {
      taking(database, 'DESK', 'CARD', at('2026-09-05', 14), 'PASS_SALE', 3500)
      taking(database, 'TILL', 'CARD', at('2026-09-23', 21), 'TAB_SETTLEMENT', 2400)
      expect(missing(database)).toEqual(['2026-09-05', '2026-09-23'])
      expect(missing(database, ['2026-09-05'])).toEqual(['2026-09-23'])
    })
  })

  test('a settlement at 01:00 is the night before\'s', async () => {
    await withDatabase(async (database) => {
      taking(database, 'TILL', 'CARD', at('2026-09-24', 1), 'TAB_SETTLEMENT', 800)
      expect(missing(database)).toEqual(['2026-09-23'])
    })
  })

  test('credit, comps, zero-value admissions and imported history are not reader takings', async () => {
    await withDatabase(async (database) => {
      taking(database, 'TILL', 'TAB', at('2026-09-10', 20), 'BAR_ITEM', 600)
      taking(database, 'TILL', 'COMP', at('2026-09-11', 20), 'BAR_ITEM', 0)
      taking(database, 'SELF_SERVE', 'NONE', at('2026-09-12', 20), 'PASS_ADMISSION', 0)
      taking(database, 'IMPORT', 'CARD', at('2026-09-13', 20), 'IMPORT', 128_400)
      expect(missing(database)).toEqual([])
    })
  })

  test('takings before the first reconciled night are never walked', async () => {
    await withDatabase(async (database) => {
      taking(database, 'DESK', 'CARD', at('2026-08-20', 19), 'WALK_UP', 900)
      const [text, ...parameters] = boundStatement(database, takingsDaysQuery())
      expect(text.toLowerCase()).toContain('group by')
      expect(parameters).toEqual([FIRST_RECONCILED_NIGHT])
      expect(read(database, takingsDaysQuery())).toEqual([])
    })
  })
})

describe('append-only, and the database is what says so (0010)', () => {
  test('an update is refused', async () => {
    await withDatabase(async (database) => {
      const id = record(database, NIGHT, 0, 0)
      expect(() => database.batch([['UPDATE z_readings SET reader_pence = 1 WHERE id = ?', id]])).toThrow()
    })
  })

  test('a delete is refused', async () => {
    await withDatabase(async (database) => {
      const id = record(database, NIGHT, 0, 0)
      expect(() => database.batch([['DELETE FROM z_readings WHERE id = ?', id]])).toThrow()
    })
  })
})
