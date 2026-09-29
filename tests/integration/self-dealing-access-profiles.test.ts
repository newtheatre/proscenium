import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import { decisionPredicate } from '#server/utils/access-profiles'
import { auditIfChanged } from '#server/utils/audit'
import { auditEntry } from '#shared/utils/audit'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// D-127 criterion 2, 0115: nobody verifies or declines their own declaration. The refusal is on
// the UPDATE that decides it (0003), so no read before it can be skipped around.

const NOW = 1_800_000_000
let database: TestDatabase

beforeEach(async () => {
  database = await createTestDatabase()
  database.batch([
    ['INSERT INTO users (id, email, name) VALUES (?, ?, ?)', 'u-secretary', 'secretary@example.test', 'The Secretary (test)'],
    ['INSERT INTO users (id, email, name) VALUES (?, ?, ?)', 'u-officer', 'officer@example.test', 'Another officer (test)'],
    ['INSERT INTO access_profiles (user_id, status, encrypted_payload, encryption_iv, created_at) VALUES (?, ?, ?, ?, ?)',
      'u-secretary', 'PENDING', 'c1', 'iv-read', NOW - 60],
  ])
})

afterEach(() => {
  database.close()
})

function run(statement: SQL): unknown[] {
  const [query, ...parameters] = boundStatement(database, statement)
  return database.raw.prepare(query).all(...parameters as never[]) as unknown[]
}

// The two decisions as verifyAccessProfile and declineAccessProfile write them, each followed by
// its audit entry, which lands only if the decision applied.
function decide(outcome: 'VERIFIED' | 'DECLINED', officerId: string): unknown[] {
  const written = run(sql`
    UPDATE access_profiles
    SET status = ${outcome}, encrypted_payload = 'c-decided', encryption_iv = 'iv-decided', verified_by = ${outcome === 'VERIFIED' ? officerId : null}, updated_at = ${NOW}
    WHERE user_id = ${'u-secretary'} AND ${decisionPredicate(NOW, 'iv-read', officerId)}
    RETURNING user_id AS userId
  `)
  const action = outcome === 'VERIFIED' ? 'access-profile.verified' : 'access-profile.declined'
  run(auditIfChanged(auditEntry({ actorId: officerId, action, target: 'user:u-secretary' })))
  return written
}

const profile = (): { status: string, verifiedBy: string | null } | undefined =>
  rows<{ status: string, verifiedBy: string | null }>(database,
    'SELECT status, verified_by AS verifiedBy FROM access_profiles WHERE user_id = ?', 'u-secretary')[0]

const decisions = (): unknown[] =>
  rows(database, `SELECT id FROM audit_log WHERE action IN ('access-profile.verified', 'access-profile.declined') AND target = ?`, 'user:u-secretary')

describe('an officer never decides their own declaration (D-127 criterion 2, 0115)', () => {
  test('verifying one\'s own declaration changes nothing and records nothing', () => {
    expect(decide('VERIFIED', 'u-secretary')).toEqual([])
    expect(profile()).toEqual({ status: 'PENDING', verifiedBy: null })
    expect(decisions()).toEqual([])
  })

  test('declining one\'s own declaration is refused the same way', () => {
    expect(decide('DECLINED', 'u-secretary')).toEqual([])
    expect(profile()).toEqual({ status: 'PENDING', verifiedBy: null })
    expect(decisions()).toEqual([])
  })

  test('another officer verifies the same declaration, once', () => {
    expect(decide('VERIFIED', 'u-officer')).toHaveLength(1)
    expect(profile()).toEqual({ status: 'VERIFIED', verifiedBy: 'u-officer' })
    expect(decisions()).toHaveLength(1)
  })
})
