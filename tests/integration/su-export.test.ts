import { describe, expect, test } from 'bun:test'
import { seasonTicketRevenueQuery } from '#server/utils/revenue-by-show'
import { toCsv } from '#server/utils/csv'
import { periodBounds, seasonRangeQuery } from '#server/utils/season-dashboard'
import { rangeClosedQuery } from '#server/utils/period-locks'
import { nominalMappingsQuery, suExportCountQuery, suExportQuery } from '#server/utils/su-export'
import { LEDGER_POSTING_PAIRS, suExportCsvRows } from '#shared/utils/su-export'
import type { SuExportRow } from '#shared/utils/su-export'
import { createTestDatabase, boundStatement, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// I-108 against the real migrated schema: `su_nominal_mappings` is seeded, never created here,
// and the export is one row per ledger line, categorised by whatever the seed migration mapped.

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

const ACTOR = 'u-treasurer'

function seedActor(database: TestDatabase): void {
  database.batch([[
    'INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)',
    ACTOR, 'treasurer@example.invalid', 'A Treasurer',
  ]])
}

let entrySeq = 0
let lineSeq = 0

// Noon UTC on the given day: always the same London calendar day regardless of DST, and inside
// any range test computes from that day's own bounds (unlike `unixepoch()`, which is today's).
function atNoonOn(day: string): number {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number]
  return Math.floor(Date.UTC(year, month - 1, date, 12, 0, 0) / 1000)
}

function entry(database: TestDatabase, day: string, source = 'DESK'): string {
  const id = `e-${++entrySeq}`
  database.batch([[
    `INSERT INTO ledger_entries (id, happened_at, london_day, source, tender, actor_id, total_pence)
     VALUES (?, ?, ?, ?, 'CARD', ?, 0)`,
    id, atNoonOn(day), day, source, ACTOR,
  ]])
  return id
}

function line(database: TestDatabase, entryId: string, kind: string, amountPence: number): void {
  database.batch([[
    'INSERT INTO ledger_lines (id, entry_id, kind, amount_pence) VALUES (?, ?, ?, ?)',
    `l-${++lineSeq}`, entryId, kind, amountPence,
  ]])
}

// Exactly setNominalMapping()'s update, minus the audit write that server/utils/su-export.ts
// batches alongside it: that composition is covered end to end in tests/e2e.
function mapNominal(database: TestDatabase, kind: string, source: string, nominalCode: string | null): void {
  database.raw.prepare(
    'UPDATE su_nominal_mappings SET nominal_code = ?, updated_by = ?, updated_at = 0 WHERE kind = ? AND source = ?',
  ).run(nominalCode, ACTOR, kind, source)
}

function read<T>(database: TestDatabase, statement: SQL): T[] {
  const [query, ...parameters] = boundStatement(database, statement)
  return rows<T>(database, query, ...parameters)
}

// Exactly lockStatement()'s insert (period-locks.ts).
function lock(database: TestDatabase, id: string, fromDay: string, toDay: string, action: 'CLOSED' | 'REOPENED', at = 0): void {
  database.raw.prepare(
    'INSERT INTO period_locks (id, from_day, to_day, action, actor_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, fromDay, toDay, action, ACTOR, at)
}

// Exactly isRangeClosed(): its own query, read the same way.
function rangeClosed(database: TestDatabase, fromDay: string, toDay: string): boolean {
  const [row] = read<{ action: string, reopenedSince: number }>(database, rangeClosedQuery(fromDay, toDay))
  return row?.action === 'CLOSED' && !row.reopenedSince
}

describe('the nominal mapping seed (I-108 criterion 1)', () => {
  test('every posting pair is seeded, unmapped', async () => {
    await withDatabase((database) => {
      const seeded = read<{ kind: string, source: string, nominalCode: string | null }>(database, nominalMappingsQuery())
      expect(seeded.length).toBe(LEDGER_POSTING_PAIRS.length)
      expect(seeded.every(row => row.nominalCode === null)).toBe(true)
      for (const pair of LEDGER_POSTING_PAIRS) {
        expect(seeded).toContainEqual(expect.objectContaining({ kind: pair.kind, source: pair.source }))
      }
    })
  })

  test('a till walk-up line can be mapped, and exports under its code (issue #1283)', () => {
    return withDatabase((database) => {
      seedActor(database)
      mapNominal(database, 'WALK_UP', 'TILL', '4120')
      line(database, entry(database, '2026-09-10', 'TILL'), 'WALK_UP', 1200)

      const [row] = read<SuExportRow>(database, suExportQuery('2026-09-01', '2026-09-30'))
      expect(row).toMatchObject({ kind: 'WALK_UP', source: 'TILL', nominalCode: '4120', amountPence: 1200 })
    })
  })
})

describe('changing what a pair maps to (J-104 criterion 5)', () => {
  test('an update changes only the targeted pair', () => {
    return withDatabase((database) => {
      seedActor(database)
      mapNominal(database, 'WALK_UP', 'DESK', '4100')

      const seeded = read<{ kind: string, source: string, nominalCode: string | null }>(database, nominalMappingsQuery())
      const changed = seeded.find(one => one.kind === 'WALK_UP' && one.source === 'DESK')
      const untouched = seeded.find(one => one.kind === 'TICKET_COLLECTION' && one.source === 'DESK')
      expect(changed?.nominalCode).toBe('4100')
      expect(untouched?.nominalCode).toBeNull()
    })
  })

  test('clearing a mapping back to null is the same update, the other way', () => {
    return withDatabase((database) => {
      seedActor(database)
      mapNominal(database, 'WALK_UP', 'DESK', '4100')
      mapNominal(database, 'WALK_UP', 'DESK', null)

      const seeded = read<{ kind: string, source: string, nominalCode: string | null }>(database, nominalMappingsQuery())
      const changed = seeded.find(one => one.kind === 'WALK_UP' && one.source === 'DESK')
      expect(changed?.nominalCode).toBeNull()
    })
  })
})

describe('the period export (I-108 criteria 2, 3)', () => {
  test('a mapped line exports with its category and code, in pence', () => {
    return withDatabase((database) => {
      seedActor(database)
      mapNominal(database, 'WALK_UP', 'DESK', '4100')

      const sale = entry(database, '2026-09-15')
      line(database, sale, 'WALK_UP', 900)

      const [row] = read<{ kind: string, nominalCode: string | null, amountPence: number }>(
        database, suExportQuery('2026-09-01', '2026-09-30'))
      expect(row).toMatchObject({ kind: 'WALK_UP', nominalCode: '4100', amountPence: 900 })
    })
  })

  test('an unmapped line still exports, with a null code (criterion 3)', () => {
    return withDatabase((database) => {
      seedActor(database)
      const sale = entry(database, '2026-09-15')
      line(database, sale, 'WALK_UP', 900)

      const [row] = read<{ nominalCode: string | null }>(database, suExportQuery('2026-09-01', '2026-09-30'))
      expect(row?.nominalCode).toBeNull()
    })
  })

  test('a line outside the range does not export', () => {
    return withDatabase((database) => {
      seedActor(database)
      const sale = entry(database, '2026-08-31')
      line(database, sale, 'WALK_UP', 900)

      expect(read(database, suExportQuery('2026-09-01', '2026-09-30'))).toEqual([])
    })
  })

  test('a refund line exports its own signed pence, negative', () => {
    return withDatabase((database) => {
      seedActor(database)
      const refund = entry(database, '2026-09-15')
      line(database, refund, 'REFUND', -400)

      const [row] = read<{ amountPence: number }>(database, suExportQuery('2026-09-01', '2026-09-30'))
      expect(row?.amountPence).toBe(-400)
    })
  })
})

describe('never disagreeing with I-106 for the same money (shared query, not a second total)', () => {
  test('summing this export\'s ticket lines over a range equals the season ticket revenue query', () => {
    return withDatabase((database) => {
      seedActor(database)
      const saleA = entry(database, '2026-09-15')
      line(database, saleA, 'WALK_UP', 900)
      const saleB = entry(database, '2026-09-16')
      line(database, saleB, 'WALK_UP', 500)
      const refund = entry(database, '2026-09-17')
      line(database, refund, 'REFUND', -300)

      const exportRows = read<{ kind: string, amountPence: number }>(database, suExportQuery('2026-09-01', '2026-09-30'))
      const exportNet = exportRows
        .filter(row => ['TICKET_COLLECTION', 'WALK_UP', 'REFUND'].includes(row.kind))
        .reduce((sum, row) => sum + row.amountPence, 0)

      const AT = Math.floor(Date.UTC(2026, 8, 1) / 1000)
      const oneMonth = 31 * 24 * 60 * 60
      const [season] = read<{ grossPence: number, refundedPence: number }>(
        database, seasonTicketRevenueQuery(AT, AT + oneMonth))
      expect(exportNet).toBe(season!.grossPence - season!.refundedPence)
    })
  })
})

describe('whether an exported range is still open to a correction (I-108)', () => {
  test('no lock at all is open', () => {
    return withDatabase((database) => {
      expect(rangeClosed(database, '2026-09-01', '2026-09-30')).toBe(false)
    })
  })

  test('a range closed exactly is closed', () => {
    return withDatabase((database) => {
      seedActor(database)
      lock(database, 'lock-1', '2026-09-01', '2026-09-30', 'CLOSED')
      expect(rangeClosed(database, '2026-09-01', '2026-09-30')).toBe(true)
    })
  })

  test('a range only partly covered by a close is open, not closed', () => {
    return withDatabase((database) => {
      seedActor(database)
      lock(database, 'lock-1', '2026-09-01', '2026-09-15', 'CLOSED')
      expect(rangeClosed(database, '2026-09-01', '2026-09-30')).toBe(false)
    })
  })

  test('a range wholly inside a wider close is closed', () => {
    return withDatabase((database) => {
      seedActor(database)
      lock(database, 'lock-1', '2026-08-01', '2026-12-31', 'CLOSED')
      expect(rangeClosed(database, '2026-09-01', '2026-09-30')).toBe(true)
    })
  })

  test('reopening the exact range makes it open again', () => {
    return withDatabase((database) => {
      seedActor(database)
      lock(database, 'lock-1', '2026-09-01', '2026-09-30', 'CLOSED', 0)
      lock(database, 'lock-2', '2026-09-01', '2026-09-30', 'REOPENED', 1)
      expect(rangeClosed(database, '2026-09-01', '2026-09-30')).toBe(false)
    })
  })

  test('a smaller close reopened inside a later, wider close makes the wider range open', () => {
    return withDatabase((database) => {
      seedActor(database)
      lock(database, 'lock-1', '2025-09-01', '2025-09-30', 'CLOSED', 0)
      lock(database, 'lock-2', '2025-08-01', '2026-07-31', 'CLOSED', 1)
      lock(database, 'lock-3', '2025-09-01', '2025-09-30', 'REOPENED', 2)
      expect(rangeClosed(database, '2025-08-01', '2026-07-31')).toBe(false)
    })
  })

  test('a reopen from before the wider close does not open it', () => {
    return withDatabase((database) => {
      seedActor(database)
      lock(database, 'lock-1', '2025-09-01', '2025-09-30', 'CLOSED', 0)
      lock(database, 'lock-2', '2025-09-01', '2025-09-30', 'REOPENED', 1)
      lock(database, 'lock-3', '2025-08-01', '2026-07-31', 'CLOSED', 2)
      expect(rangeClosed(database, '2025-08-01', '2026-07-31')).toBe(true)
    })
  })
})

// Exactly what export.get.ts returns for a range: the same query, shaped and quoted the same way.
function exportFile(database: TestDatabase, fromDay: string, toDay: string): string {
  return toCsv(suExportCsvRows(read<SuExportRow>(database, suExportQuery(fromDay, toDay))))
}

describe('the yearly return, re-runnable identically (criterion 4)', () => {
  test('a year runs 1 August to 31 July, the same days the money dashboard reads (0087)', () => {
    return withDatabase((database) => {
      seedActor(database)
      for (const day of ['2025-07-31', '2025-08-01', '2026-07-31', '2026-08-01']) line(database, entry(database, day), 'WALK_UP', 100)

      const { fromDay, toDay } = periodBounds({ kind: 'YEAR', year: 2026 })
      expect({ fromDay, toDay }).toEqual({ fromDay: '2025-08-01', toDay: '2026-07-31' })
      expect(read<{ londonDay: string }>(database, suExportQuery(fromDay, toDay)).map(row => row.londonDay)).toEqual(['2025-08-01', '2026-07-31'])
    })
  })

  test('a season runs its own row\'s days, both inclusive', () => {
    return withDatabase((database) => {
      seedActor(database)
      database.batch([['INSERT INTO seasons (id, name, starts_on, ends_on) VALUES (?, ?, ?, ?)', 'season-autumn', 'Autumn 2026', '2026-09-20', '2026-12-10']])
      for (const day of ['2026-09-19', '2026-09-20', '2026-12-10', '2026-12-11']) line(database, entry(database, day), 'WALK_UP', 100)

      const [range] = read<{ fromDay: string, toDay: string }>(database, seasonRangeQuery('season-autumn'))
      expect(range).toEqual({ fromDay: '2026-09-20', toDay: '2026-12-10' })
      expect(read<{ londonDay: string }>(database, suExportQuery(range!.fromDay, range!.toDay)).map(row => row.londonDay)).toEqual(['2026-09-20', '2026-12-10'])
    })
  })

  test('two runs over a closed range are byte-identical, even after a post into it is tried', () => {
    return withDatabase((database) => {
      seedActor(database)
      mapNominal(database, 'WALK_UP', 'DESK', '4100')
      const sale = entry(database, '2025-09-15')
      line(database, sale, 'WALK_UP', 900)
      line(database, sale, 'WALK_UP', 450)
      const bar = entry(database, '2025-09-15', 'TILL')
      line(database, bar, 'BAR_ITEM', 350)
      const refund = entry(database, '2026-02-01')
      line(database, refund, 'REFUND', -900)
      lock(database, 'lock-year', '2025-08-01', '2026-07-31', 'CLOSED')

      const first = exportFile(database, '2025-08-01', '2026-07-31')
      expect(() => entry(database, '2026-03-01')).toThrow(/ledger_entries_refuses_a_closed_period/)
      const second = exportFile(database, '2025-08-01', '2026-07-31')

      expect(rangeClosed(database, '2025-08-01', '2026-07-31')).toBe(true)
      expect(first.split('\r\n').length).toBe(6)
      expect(second).toBe(first)
    })
  })

  test('the count the screen checks against the cap is the export\'s own row count', () => {
    return withDatabase((database) => {
      seedActor(database)
      const sale = entry(database, '2026-09-15')
      line(database, sale, 'WALK_UP', 900)
      line(database, sale, 'WALK_UP', 450)
      line(database, entry(database, '2026-10-01'), 'WALK_UP', 100)

      const [counted] = read<{ rows: number }>(database, suExportCountQuery('2026-09-01', '2026-09-30'))
      expect(counted?.rows).toBe(read(database, suExportQuery('2026-09-01', '2026-09-30')).length)
      expect(counted?.rows).toBe(2)
    })
  })
})
