import { describe, expect, test } from 'bun:test'
import {
  ensureNightStatement,
  joinDeviceStatement,
  nightRowQuery,
  recordFailedAttemptStatement,
  recordSuccessStatement,
} from '#server/utils/backstage'
import { MAX_FAILED_ATTEMPTS } from '#shared/utils/backstage'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { testVenue } from '#tests/helpers/programme'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// E-120's pure statement and query builders against the real migrations. The async orchestration
// (`attemptJoin`, `currentCode`) needs the live `db` singleton and is covered end to end.

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function run(database: TestDatabase, statement: SQL): Record<string, unknown>[] {
  const [query, ...parameters] = boundStatement(database, statement)
  return rows(database, query, ...parameters)
}

const NIGHT = '2026-09-14'

describe('a night row is created once (criteria 2, 3)', () => {
  test('ensuring it twice makes one row', async () => {
    await withDatabase((database) => {
      const venue = testVenue(database)
      run(database, ensureNightStatement(venue.id, NIGHT, 'bn-1'))
      run(database, ensureNightStatement(venue.id, NIGHT, 'bn-2'))

      const found = run(database, nightRowQuery(venue.id, NIGHT))
      expect(found).toHaveLength(1)
      expect(found[0]).toMatchObject({ id: 'bn-1', epoch: 0, failedAttempts: 0 })
    })
  })

  test('two venues, or two nights at the same venue, are two rows', async () => {
    await withDatabase((database) => {
      const a = testVenue(database, { suffix: 'a' })
      const b = testVenue(database, { suffix: 'b' })
      run(database, ensureNightStatement(a.id, NIGHT, 'bn-a'))
      run(database, ensureNightStatement(b.id, NIGHT, 'bn-b'))
      run(database, ensureNightStatement(a.id, '2026-09-15', 'bn-a2'))

      expect(run(database, nightRowQuery(a.id, NIGHT))).toHaveLength(1)
      expect(run(database, nightRowQuery(b.id, NIGHT))).toHaveLength(1)
      expect(run(database, nightRowQuery(a.id, '2026-09-15'))).toHaveLength(1)
    })
  })
})

describe('ten failed attempts rotate the code (criterion 4)', () => {
  test('the epoch holds through nine failures and moves on the tenth, with the counter reset', async () => {
    await withDatabase((database) => {
      const venue = testVenue(database)
      run(database, ensureNightStatement(venue.id, NIGHT, 'bn-1'))

      for (let attempt = 1; attempt < MAX_FAILED_ATTEMPTS; attempt++) {
        const [result] = run(database, recordFailedAttemptStatement('bn-1'))
        expect(result).toMatchObject({ epoch: 0, failedAttempts: attempt })
      }

      const [rotated] = run(database, recordFailedAttemptStatement('bn-1'))
      expect(rotated).toMatchObject({ epoch: 1, failedAttempts: 0 })
    })
  })

  test('a success resets the counter without moving the epoch', async () => {
    await withDatabase((database) => {
      const venue = testVenue(database)
      run(database, ensureNightStatement(venue.id, NIGHT, 'bn-1'))
      run(database, recordFailedAttemptStatement('bn-1'))
      run(database, recordFailedAttemptStatement('bn-1'))

      run(database, recordSuccessStatement('bn-1'))

      const [after] = run(database, nightRowQuery(venue.id, NIGHT))
      expect(after).toMatchObject({ epoch: 0, failedAttempts: 0 })
    })
  })
})

describe('a joined device (criterion 1)', () => {
  test('holds a label and a token hash, and nothing that names a person', async () => {
    await withDatabase((database) => {
      const venue = testVenue(database)
      run(database, ensureNightStatement(venue.id, NIGHT, 'bn-1'))
      run(database, joinDeviceStatement('bn-1', 'Stage left', 'a'.repeat(64), 0, 'bd-1'))

      const [row] = rows<{ label: string, token_hash: string, joined_epoch: number }>(
        database, 'SELECT label, token_hash, joined_epoch FROM backstage_devices WHERE id = ?', 'bd-1')
      expect(row).toMatchObject({ label: 'Stage left', token_hash: 'a'.repeat(64), joined_epoch: 0 })
    })
  })

  test('two devices cannot share a token hash', async () => {
    await withDatabase((database) => {
      const venue = testVenue(database)
      run(database, ensureNightStatement(venue.id, NIGHT, 'bn-1'))
      database.batch([['INSERT INTO backstage_devices (id, night_id, label, token_hash, joined_epoch) VALUES (?, ?, ?, ?, ?)',
        'bd-1', 'bn-1', 'Stage left', 'a'.repeat(64), 0]])

      expect(() => database.batch([['INSERT INTO backstage_devices (id, night_id, label, token_hash, joined_epoch) VALUES (?, ?, ?, ?, ?)',
        'bd-2', 'bn-1', 'Stage right', 'a'.repeat(64), 0]])).toThrow()
    })
  })
})
