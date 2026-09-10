import { describe, expect, test } from 'bun:test'
import { seasonTicketRevenueQuery } from '#server/utils/revenue-by-show'
import { nominalMappingsQuery, suExportQuery } from '#server/utils/su-export'
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

// Exactly isRangeClosed()'s query.
function rangeClosed(database: TestDatabase, fromDay: string, toDay: string): boolean {
  const [row] = rows<{ action: string }>(database, `
    SELECT action FROM period_locks WHERE from_day <= ? AND to_day >= ? ORDER BY created_at DESC, id DESC LIMIT 1
  `, fromDay, toDay)
  return row?.action === 'CLOSED'
}

describe('the nominal mapping seed (I-108 criterion 1)', () => {
  test('every posting pair is seeded, unmapped', async () => {
    await withDatabase((database) => {
      const seeded = read<{ kind: string, source: string, nominalCode: string | null }>(database, nominalMappingsQuery())
      expect(seeded.length).toBe(9)
      expect(seeded.every(row => row.nominalCode === null)).toBe(true)
      expect(seeded).toContainEqual(expect.objectContaining({ kind: 'TICKET_COLLECTION', source: 'DESK' }))
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
})
