import { describe, expect, test } from 'bun:test'
import { auditIfChanged } from '#server/utils/audit'
import { revokeFellowshipStatement } from '#server/utils/fellowship-pass'
import { auditEntry } from '#shared/utils/audit'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// A revocation's `revoked_at IS NULL` rides the UPDATE (0003), so two officers revoking at once
// leave one revocation, the first one's, and one trail row: the second finds nothing to change.

function run(database: TestDatabase, statement: SQL): unknown[] {
  const [query, ...parameters] = boundStatement(database, statement)
  return database.raw.prepare(query).all(...parameters as never[]) as unknown[]
}

async function withDatabase(fn: (database: TestDatabase) => void): Promise<void> {
  const database = await createTestDatabase()
  try {
    fn(database)
  }
  finally {
    database.close()
  }
}

function revoke(database: TestDatabase, actorId: string, reason: string, at: number): unknown[] {
  const written = run(database, revokeFellowshipStatement('f-1', actorId, reason, at))
  run(database, auditIfChanged(auditEntry({ actorId, action: 'fellowship.revoked', target: 'fellowship:f-1' })))
  return written
}

describe('two revocations of one fellowship leave one (0003, 0049)', () => {
  test('the second finds the award already revoked, changes nothing and leaves no trail row', async () => {
    await withDatabase((database) => {
      database.batch([
        ['INSERT INTO users (id, email, name) VALUES (?, ?, ?)', 'u-1', 'fellow@example.invalid', 'An Alumna (test)'],
        ['INSERT INTO users (id, email, name) VALUES (?, ?, ?)', 'u-2', 'first@example.invalid', 'First Officer (test)'],
        ['INSERT INTO users (id, email, name) VALUES (?, ?, ?)', 'u-3', 'second@example.invalid', 'Second Officer (test)'],
        ['INSERT INTO fellowships (id, user_id, awarded_on, awarded_by, citation) VALUES (?, ?, ?, ?, ?)',
          'f-1', 'u-1', '2019-06-12', 'Committee, 12 June 2019', 'For a decade behind the lighting desk.'],
      ])

      expect(revoke(database, 'u-2', 'The first reason.', 1_800_000_000)).toHaveLength(1)
      expect(revoke(database, 'u-3', 'The second reason.', 1_800_000_060)).toHaveLength(0)

      const [held] = rows<{ revokedAt: number, revokedBy: string, reason: string }>(database,
        'SELECT revoked_at AS revokedAt, revoked_by AS revokedBy, revocation_reason AS reason FROM fellowships WHERE id = ?', 'f-1')
      expect(held).toEqual({ revokedAt: 1_800_000_000, revokedBy: 'u-2', reason: 'The first reason.' })
      expect(rows(database, 'SELECT id FROM audit_log WHERE action = ?', 'fellowship.revoked')).toHaveLength(1)
    })
  })
})
