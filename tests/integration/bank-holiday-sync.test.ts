import { describe, expect, test } from 'bun:test'
import {
  listChangeStatements,
  syncedStatement,
  syncFailedStatement,
  syncHistoryQuery,
} from '#server/utils/bank-holiday-statements'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { SyncHistoryRow } from '#server/utils/bank-holiday-statements'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// C-121 criteria 7 and 8, decision 0091, against the real migrations: the sync's own statements,
// run the way D1 runs a batch. The fetch and the task around them are server/utils/bank-holidays.ts.

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function batch(database: TestDatabase, statements: SQL[]): void {
  database.batch(statements.map(statement => boundStatement(database, statement)))
}

function history(database: TestDatabase): SyncHistoryRow {
  const [query, ...parameters] = boundStatement(database, syncHistoryQuery())
  return rows<SyncHistoryRow>(database, query, ...parameters)[0]!
}

function stored(database: TestDatabase): { value: string, updated_by: string | null, updated_at: number } | undefined {
  return rows<{ value: string, updated_by: string | null, updated_at: number }>(database,
    'SELECT value, updated_by, updated_at FROM config WHERE key = \'BANK_HOLIDAYS\'')[0]
}

const change = { key: 'BANK_HOLIDAYS', changes: { value: { from: ['2026-12-25'], to: ['2026-12-25', '2027-01-01'] } } }

describe('a valid response replaces the list, as the system (criterion 7)', () => {
  test('the list, its change and the sync are written together, with no actor on the list', async () => {
    await withDatabase((database) => {
      const dates = ['2026-12-25', '2027-01-01']
      batch(database, [...listChangeStatements(dates, change, 1_000), syncedStatement(null, dates, 1_000)])

      expect(stored(database)).toEqual({ value: JSON.stringify(dates), updated_by: null, updated_at: 1_000 })

      const trail = rows<{ actor_id: string | null, action: string, target: string | null, detail: string, created_at: number }>(database,
        'SELECT actor_id, action, target, detail, created_at FROM audit_log ORDER BY action')
      expect(trail.map(row => [row.action, row.actor_id, row.target])).toEqual([
        ['bank-holidays.synced', null, null],
        ['config.changed', null, 'config:BANK_HOLIDAYS'],
      ])
      expect(JSON.parse(trail[0]!.detail)).toEqual({ dates: 2, coveredTo: '2027-01-01' })
      expect(trail.every(row => row.created_at === 1_000)).toBe(true)
    })
  })

  test('whoever pressed Sync now is the actor of the run, never of the list', async () => {
    await withDatabase((database) => {
      database.batch([['INSERT INTO users (id, email, name) VALUES (?, ?, ?)', 'u-it', 'it@example.invalid', 'IT Manager']])
      const dates = ['2026-12-25']
      batch(database, [...listChangeStatements(dates, change, 1_000), syncedStatement('u-it', dates, 1_000)])

      expect(stored(database)!.updated_by).toBeNull()
      expect(rows(database, 'SELECT actor_id, action FROM audit_log ORDER BY action')).toEqual([
        { actor_id: 'u-it', action: 'bank-holidays.synced' },
        { actor_id: null, action: 'config.changed' },
      ])
    })
  })

  test('two overlapping runs writing the same list audit the change once (0003)', async () => {
    await withDatabase((database) => {
      const dates = ['2026-12-25', '2027-01-01']
      batch(database, listChangeStatements(dates, change, 1_000))
      batch(database, listChangeStatements(dates, change, 1_001))

      expect(rows(database, 'SELECT id FROM audit_log WHERE action = \'config.changed\'')).toHaveLength(1)
      expect(stored(database)!.value).toBe(JSON.stringify(dates))
    })
  })

  test('a list that does change again is audited again', async () => {
    await withDatabase((database) => {
      batch(database, listChangeStatements(['2026-12-25'], change, 1_000))
      batch(database, listChangeStatements(['2026-12-25', '2027-01-01'], change, 2_000))

      expect(rows(database, 'SELECT id FROM audit_log WHERE action = \'config.changed\'')).toHaveLength(2)
      expect(stored(database)).toMatchObject({ value: JSON.stringify(['2026-12-25', '2027-01-01']), updated_at: 2_000 })
    })
  })
})

describe('a failure leaves the list untouched and is recorded (criteria 7 and 8)', () => {
  test('the list stands exactly as it was, and the failure is a word and a status, nothing more', async () => {
    await withDatabase((database) => {
      batch(database, [...listChangeStatements(['2026-12-25'], change, 1_000), syncedStatement(null, ['2026-12-25'], 1_000)])
      const before = stored(database)

      batch(database, [syncFailedStatement(null, { ok: false, failure: 'http', status: 503 }, 2_000)])

      expect(stored(database)).toEqual(before)
      const [failed] = rows<{ actor_id: string | null, target: string | null, detail: string }>(database,
        'SELECT actor_id, target, detail FROM audit_log WHERE action = \'bank-holidays.sync-failed\'')
      expect(failed).toMatchObject({ actor_id: null, target: null })
      expect(JSON.parse(failed!.detail)).toEqual({ failure: 'http', status: 503 })
    })
  })

  test('a failure with no status records none', async () => {
    await withDatabase((database) => {
      batch(database, [syncFailedStatement(null, { ok: false, failure: 'timeout' }, 2_000)])
      const [failed] = rows<{ detail: string }>(database, 'SELECT detail FROM audit_log WHERE action = \'bank-holidays.sync-failed\'')
      expect(JSON.parse(failed!.detail)).toEqual({ failure: 'timeout' })
    })
  })
})

describe('the sync state is read back from the trail (criterion 8)', () => {
  test('nothing ever run reads as nothing', async () => {
    await withDatabase((database) => {
      expect(history(database)).toEqual({ synced_at: null, failed_at: null, failure: null, streak_started_at: null })
    })
  })

  test('the newest success and the newest failure, with why it failed', async () => {
    await withDatabase((database) => {
      batch(database, [syncedStatement(null, ['2026-12-25'], 1_000)])
      batch(database, [syncedStatement(null, ['2026-12-25'], 2_000)])
      batch(database, [syncFailedStatement(null, { ok: false, failure: 'network' }, 3_000)])
      batch(database, [syncFailedStatement(null, { ok: false, failure: 'timeout' }, 4_000)])

      expect(history(database)).toEqual({ synced_at: 2_000, failed_at: 4_000, failure: 'timeout', streak_started_at: 3_000 })
    })
  })

  test('a success ends the streak, so the next failure starts a new one (criterion 9)', async () => {
    await withDatabase((database) => {
      batch(database, [syncFailedStatement(null, { ok: false, failure: 'network' }, 1_000)])
      expect(history(database).streak_started_at).toBe(1_000)

      batch(database, [syncedStatement(null, ['2026-12-25'], 2_000)])
      expect(history(database).streak_started_at).toBeNull()

      batch(database, [syncFailedStatement(null, { ok: false, failure: 'invalid' }, 3_000)])
      expect(history(database)).toMatchObject({ synced_at: 2_000, failed_at: 3_000, streak_started_at: 3_000 })
    })
  })

  test('the trail is append-only, so a recorded failure cannot be tidied away (0010)', async () => {
    await withDatabase((database) => {
      batch(database, [syncFailedStatement(null, { ok: false, failure: 'network' }, 1_000)])
      expect(() => database.raw.exec('DELETE FROM audit_log WHERE action = \'bank-holidays.sync-failed\'')).toThrow()
    })
  })
})
