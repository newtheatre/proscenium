import { describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import { decisionPredicate, savePredicate } from '#server/utils/access-profiles'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// Issue 1383, 0003: an officer's decision and a member's save are each conditional on the row they
// read, on the statement itself, so the other's write landing in between refuses it.

const NOW = 1_800_000_000

function run(database: TestDatabase, statement: SQL): unknown[] {
  const [query, ...parameters] = boundStatement(database, statement)
  return database.raw.prepare(query).all(...parameters as never[]) as unknown[]
}

// The payload and its IV are set or unset together (the 0059 CHECK), so a row is seeded as a pair.
function declared(database: TestDatabase, userId: string, payload: string | null, iv: string | null): void {
  database.batch([
    ['INSERT INTO users (id, email, name) VALUES (?, ?, ?)', userId, `${userId}@example.test`, 'A Member (test)'],
    ['INSERT INTO access_profiles (user_id, status, encrypted_payload, encryption_iv, created_at) VALUES (?, ?, ?, ?, ?)',
      userId, 'PENDING', payload, iv, NOW - 60],
  ])
}

// The verify write as verifyAccessProfile runs it, then its audit entry, which lands only if it applied.
function verify(database: TestDatabase, userId: string, version: string | null): unknown[] {
  const written = run(database, sql`
    UPDATE access_profiles
    SET status = 'VERIFIED', encrypted_payload = 'c-decided', encryption_iv = 'iv-decided', updated_at = ${NOW}
    WHERE user_id = ${userId} AND ${decisionPredicate(NOW, version)}
    RETURNING user_id AS userId
  `)
  run(database, sql`
    INSERT INTO audit_log (id, actor_id, action, target, detail)
    SELECT ${crypto.randomUUID()}, NULL, 'access-profile.verified', ${`user:${userId}`}, NULL
    WHERE changes() = 1
  `)
  return written
}

// The member's save as declareAccessProfile runs it over an existing row, then its audit entry.
function save(database: TestDatabase, userId: string, status: string, version: string | null): unknown[] {
  const written = run(database, sql`
    UPDATE access_profiles
    SET status = 'PENDING', encrypted_payload = 'c-saved', encryption_iv = 'iv-saved', verified_by = NULL, verified_at = NULL, updated_at = ${NOW}
    WHERE user_id = ${userId} AND ${savePredicate(status, version)}
    RETURNING user_id AS userId
  `)
  run(database, sql`
    INSERT INTO audit_log (id, actor_id, action, target, detail)
    SELECT ${crypto.randomUUID()}, ${userId}, 'access-profile.updated', ${`user:${userId}`}, NULL
    WHERE changes() = 1
  `)
  return written
}

describe('a decision lands only on the declaration the officer read (issue 1383)', () => {
  test('a member\'s save after the officer read refuses the verify, and the save stands', async () => {
    const database = await createTestDatabase()
    try {
      declared(database, 'u-member', 'c1', 'iv-read')
      database.batch([['UPDATE access_profiles SET encrypted_payload = ?, encryption_iv = ?, updated_at = ? WHERE user_id = ?',
        'c2', 'iv-saved', NOW, 'u-member']])

      expect(verify(database, 'u-member', 'iv-read')).toEqual([])

      const row = rows<{ status: string, iv: string }>(database,
        'SELECT status, encryption_iv AS iv FROM access_profiles WHERE user_id = ?', 'u-member')[0]
      expect(row).toEqual({ status: 'PENDING', iv: 'iv-saved' })
      expect(rows(database, `SELECT id FROM audit_log WHERE action = 'access-profile.verified' AND target = ?`, 'user:u-member')).toEqual([])
    }
    finally {
      database.close()
    }
  })

  test('with no save in between, the verify lands and is audited once', async () => {
    const database = await createTestDatabase()
    try {
      declared(database, 'u-member', 'c1', 'iv-read')
      expect(verify(database, 'u-member', 'iv-read')).toHaveLength(1)
      expect(rows(database, `SELECT id FROM audit_log WHERE action = 'access-profile.verified' AND target = ?`, 'user:u-member')).toHaveLength(1)
    }
    finally {
      database.close()
    }
  })

  test('an officer\'s verify after the member read refuses the member\'s save, and the verify stands', async () => {
    const database = await createTestDatabase()
    try {
      declared(database, 'u-saver', 'c1', 'iv-read')
      expect(verify(database, 'u-saver', 'iv-read')).toHaveLength(1)

      expect(save(database, 'u-saver', 'PENDING', 'iv-read')).toEqual([])

      const row = rows<{ status: string, iv: string }>(database,
        'SELECT status, encryption_iv AS iv FROM access_profiles WHERE user_id = ?', 'u-saver')[0]
      expect(row).toEqual({ status: 'VERIFIED', iv: 'iv-decided' })
      expect(rows(database, `SELECT id FROM audit_log WHERE action = 'access-profile.updated' AND target = ?`, 'user:u-saver')).toEqual([])
    }
    finally {
      database.close()
    }
  })

  test('with nothing in between, the member\'s save lands and is audited once', async () => {
    const database = await createTestDatabase()
    try {
      declared(database, 'u-saver', 'c1', 'iv-read')
      expect(save(database, 'u-saver', 'PENDING', 'iv-read')).toHaveLength(1)
      expect(rows(database, `SELECT id FROM audit_log WHERE action = 'access-profile.updated' AND target = ?`, 'user:u-saver')).toHaveLength(1)
    }
    finally {
      database.close()
    }
  })

  test('a row never encrypted matches a null version and nothing else', async () => {
    const database = await createTestDatabase()
    try {
      declared(database, 'u-bare', null, null)
      const touch = (version: string | null): unknown[] => run(database, sql`
        UPDATE access_profiles SET updated_at = ${NOW} WHERE user_id = ${'u-bare'} AND ${decisionPredicate(NOW, version)}
        RETURNING user_id AS userId
      `)
      expect(touch('x')).toEqual([])
      expect(touch(null)).toHaveLength(1)
    }
    finally {
      database.close()
    }
  })
})
