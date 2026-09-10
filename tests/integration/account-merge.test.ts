import { describe, expect, test } from 'bun:test'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { testVenue, tonightsPerformance } from '#tests/helpers/programme'
import type { TestDatabase } from '#tests/helpers/database'

// The SQL a merge runs, against the real migrated schema, so a constraint this test does not
// think to name still gets the last word (A-123, 0001, 0003, 0011).

const WINNER_NAME = 'Imogen Hart'
const LOSER_NAME = 'Immie Hart'
const LOSER_EMAIL = 'immie.hart@example.invalid'

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

interface Seeded { winnerId: string, loserId: string, performanceId: string, roomId: string, moduleId: string, sessionId: string }

// Both accounts hold something in every category the criterion names, plus a credential each and
// one table outside the move list, so the test can tell a real move from something left behind.
function seedDuplicate(database: TestDatabase): Seeded {
  const now = Math.floor(Date.now() / 1000)
  const winnerId = 'u-winner'
  const loserId = 'u-loser'

  database.batch([
    ['INSERT INTO users (id, email, name, password, verified) VALUES (?, ?, ?, ?, 1)',
      winnerId, 'imogen.hart@example.invalid', WINNER_NAME, 'scrypt$winner'],
    ['INSERT INTO users (id, email, name, password, verified) VALUES (?, ?, ?, ?, 1)',
      loserId, LOSER_EMAIL, LOSER_NAME, 'scrypt$loser'],
    ['INSERT INTO users (id, email, name, password, verified) VALUES (?, ?, ?, ?, 1)',
      'u-admin', 'admin@example.invalid', 'The Administrator', 'scrypt$admin'],

    ['INSERT INTO rooms (id, name) VALUES (?, ?)', 'room-a', 'The Green Room'],
    [`INSERT INTO room_bookings (id, room_id, user_id, title, starts_at, ends_at, status)
      VALUES (?, ?, ?, ?, ?, ?, 'CONFIRMED')`, 'rb-loser', 'room-a', loserId, 'A read-through', now + 3600, now + 7200],
    [`INSERT INTO room_series (id, user_id, room_id, title, frequency, starts_on, clock_from, clock_to, occurrences)
      VALUES (?, ?, ?, ?, 'WEEKLY', '2026-09-14', '19:00', '21:00', 4)`, 'rs-loser', loserId, 'room-a', 'Weekly rehearsal'],

    ['INSERT INTO memberships (id, user_id, starts_on, expires_on, source) VALUES (?, ?, \'2026-09-14\', \'2027-09-13\', ?)',
      'm-loser', loserId, 'MANUAL'],

    ['INSERT INTO departments (code, name) VALUES (?, ?)', 'dept-a', 'Technical'],
    ['INSERT INTO modules (id, department, kind, name) VALUES (?, ?, ?, ?)', 'mod-a', 'dept-a', 'MODULE', 'Working at height'],
    [`INSERT INTO training_sessions (id, held_on, starts_at, ends_at, capacity, trainer_id)
      VALUES (?, '2026-09-20', '19:00', '21:00', 20, ?)`, 'session-a', winnerId],
    [`INSERT INTO training_records (id, user_id, module_id, session_id, awarded_on, source)
      VALUES (?, ?, ?, ?, '2026-09-20', 'SESSION')`, 'tr-loser', loserId, 'mod-a', 'session-a'],

    // Retired, never combined onto the winner (criterion 5).
    ['INSERT INTO totp_secrets (user_id, secret) VALUES (?, ?)', loserId, 'SECRETSECRET'],
    ['INSERT INTO recovery_codes (id, user_id, code_hash) VALUES (?, ?, ?)', 'rc-loser', loserId, 'abcdef'],

    // Outside the move list: stays attached to the tombstone, exactly like an officer column does.
    ['INSERT INTO emergency_contacts (user_id, name, phone, relation, updated_at) VALUES (?, ?, ?, ?, ?)',
      loserId, 'Their Mother', '07700 900000', 'mother', now],

    // The winner already holds BOX_OFFICE with a dated expiry; the loser holds it with no expiry
    // at all, so the merge must extend the winner's own row rather than leave two.
    ['INSERT INTO role_grants (id, user_id, role, expires_at) VALUES (?, ?, ?, ?)', 'grant-winner', winnerId, 'BOX_OFFICE', now + 1000],
    ['INSERT INTO role_grants (id, user_id, role, expires_at) VALUES (?, ?, ?, ?)', 'grant-loser', loserId, 'BOX_OFFICE', null],
    // A role only the loser holds moves across untouched.
    ['INSERT INTO role_grants (id, user_id, role, expires_at) VALUES (?, ?, ?, ?)', 'grant-loser-only', loserId, 'TRAINING_MANAGER', null],
  ])

  const venue = testVenue(database, { suffix: 'merge' })
  const performance = tonightsPerformance(database, { suffix: 'merge', venueId: venue.id })
  database.batch([
    [`INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, 'DOOR', 1, ?, 'CLAIMED')`,
      'shift-loser', performance.performanceId, loserId],
    [`INSERT INTO reservations (id, reference, performance_id, user_id, status, source)
      VALUES (?, ?, ?, ?, 'COLLECTED', 'WEB')`, 'res-loser', 'REF-LOSER', performance.performanceId, loserId],
  ])

  return { winnerId, loserId, performanceId: performance.performanceId, roomId: 'room-a', moduleId: 'mod-a', sessionId: 'session-a' }
}

// Mirrors server/utils/account-merge.ts's own plan and batch, without Nitro's auto-imports: what
// tests exercise instead, per shared/utils/account-merge.ts's own header comment.
async function merge(database: TestDatabase, winnerId: string, loserId: string): Promise<void> {
  const { mergeStatements, planGrantMerge } = await import('#shared/utils/account-merge')
  const now = Math.floor(Date.now() / 1000)

  const winnerGrants = rows<{ id: string, role: string, expiresAt: number | null }>(database,
    'SELECT id, role, expires_at AS expiresAt FROM role_grants WHERE user_id = ?', winnerId)
  const loserGrants = rows<{ id: string, role: string, expiresAt: number | null }>(database,
    'SELECT id, role, expires_at AS expiresAt FROM role_grants WHERE user_id = ?', loserId)
  const grantPlan = planGrantMerge(winnerGrants, loserGrants)

  interface StoredTrainingRecord {
    id: string
    moduleId: string
    awardedOn: string
    expiresOn: string | null
    expiryOverridden: number
    source: string
    sessionId: string | null
    grantedBy: string | null
    evidenceRef: string | null
    revokedAt: number | null
    revokedBy: string | null
    revokeReason: string | null
  }

  const trainingRecords = rows<StoredTrainingRecord>(database, `
    SELECT id, module_id AS moduleId, awarded_on AS awardedOn, expires_on AS expiresOn,
      expiry_overridden AS expiryOverridden, source, session_id AS sessionId, granted_by AS grantedBy,
      evidence_ref AS evidenceRef, revoked_at AS revokedAt, revoked_by AS revokedBy, revoke_reason AS revokeReason
    FROM training_records WHERE user_id = ?
  `, loserId).map(record => ({ ...record, expiryOverridden: Boolean(record.expiryOverridden) }))

  const { moves, retireCredentials, tombstone } = mergeStatements({
    winnerId, loserId, actorId: 'u-admin', grantPlan, trainingRecords, now,
  })

  database.batch([
    ...[...moves, ...retireCredentials].map(statement => boundStatement(database, statement)),
    boundStatement(database, tombstone),
    [`INSERT INTO audit_log (id, actor_id, action, target, detail)
      SELECT ?, ?, ?, ?, ? WHERE changes() = 1`,
    'al-merge', 'u-admin', 'account.merged', `user:${loserId}`, JSON.stringify({ into: winnerId })],
  ])
}

describe('merging duplicate accounts (A-123)', () => {
  test('bookings, records, shifts and membership move to the winner', async () => {
    await withDatabase(async (database) => {
      const { winnerId, loserId, performanceId } = seedDuplicate(database)
      await merge(database, winnerId, loserId)

      expect(rows(database, 'SELECT id FROM room_bookings WHERE user_id = ?', winnerId)).toHaveLength(1)
      expect(rows(database, 'SELECT id FROM room_series WHERE user_id = ?', winnerId)).toHaveLength(1)
      expect(rows(database, 'SELECT id FROM training_records WHERE user_id = ?', winnerId)).toHaveLength(1)
      expect(rows(database, 'SELECT id FROM memberships WHERE user_id = ?', winnerId)).toHaveLength(1)
      expect(rows(database, 'SELECT id FROM shifts WHERE user_id = ? AND performance_id = ?', winnerId, performanceId)).toHaveLength(1)
      expect(rows(database, 'SELECT id FROM reservations WHERE user_id = ?', winnerId)).toHaveLength(1)

      // Nothing is left behind under the loser in any of these tables, except training_records:
      // append-only refuses to move, so the original stays, revoked, alongside the new row (0041).
      for (const table of ['room_bookings', 'room_series', 'memberships', 'shifts', 'reservations']) {
        expect(`${table}: ${rows(database, `SELECT id FROM ${table} WHERE user_id = ?`, loserId).length}`).toBe(`${table}: 0`)
      }
      const originalRecord = rows<{ revokedAt: number | null, revokeReason: string | null }>(database,
        'SELECT revoked_at AS revokedAt, revoke_reason AS revokeReason FROM training_records WHERE id = ?', 'tr-loser')[0]
      expect(originalRecord?.revokedAt).not.toBeNull()
      expect(originalRecord?.revokeReason).toBe('Superseded: account merged')
    })
  })

  test('grants reconcile rather than duplicate: the winner keeps the more generous expiry, and holds one row per role', async () => {
    await withDatabase(async (database) => {
      const { winnerId, loserId } = seedDuplicate(database)
      await merge(database, winnerId, loserId)

      const boxOffice = rows<{ expiresAt: number | null }>(database,
        'SELECT expires_at AS expiresAt FROM role_grants WHERE user_id = ? AND role = ?', winnerId, 'BOX_OFFICE')
      expect(boxOffice).toHaveLength(1)
      // The loser's never-expiring grant won: the winner's dated one is gone.
      expect(boxOffice[0]?.expiresAt).toBeNull()

      const trainingManager = rows(database, 'SELECT id FROM role_grants WHERE user_id = ? AND role = ?', winnerId, 'TRAINING_MANAGER')
      expect(trainingManager).toHaveLength(1)

      expect(rows(database, 'SELECT id FROM role_grants WHERE user_id = ?', loserId)).toHaveLength(0)
    })
  })

  test('the loser\'s credentials are retired, never combined onto the winner', async () => {
    await withDatabase(async (database) => {
      const { winnerId, loserId } = seedDuplicate(database)
      await merge(database, winnerId, loserId)

      expect(rows(database, 'SELECT user_id FROM totp_secrets WHERE user_id = ?', loserId)).toHaveLength(0)
      expect(rows(database, 'SELECT id FROM recovery_codes WHERE user_id = ?', loserId)).toHaveLength(0)
      expect(rows(database, 'SELECT user_id FROM totp_secrets WHERE user_id = ?', winnerId)).toHaveLength(0)

      // The winner's own row is never a target of any merge statement (0008).
      const winner = rows<{ password: string | null }>(database, 'SELECT password FROM users WHERE id = ?', winnerId)[0]
      expect(winner?.password).toBe('scrypt$winner')
    })
  })

  test('the loser is left a tombstone: the same anonymisation shape erasure uses, labelled as a merge', async () => {
    await withDatabase(async (database) => {
      const { winnerId, loserId } = seedDuplicate(database)
      await merge(database, winnerId, loserId)

      const loser = rows<{ email: string, name: string, password: string | null, anonymisedAt: number | null }>(database,
        'SELECT email, name, password, anonymised_at AS anonymisedAt FROM users WHERE id = ?', loserId)[0]!
      expect(loser.email).toBe(`merged-${loserId}@anonymised.invalid`)
      expect(loser.name).toBe('Merged account')
      expect(loser.password).toBeNull()
      expect(loser.anonymisedAt).not.toBeNull()

      // Outside the move list, so it stays attached to the tombstone, exactly like an officer
      // column resolving to it would (A-123 leaves this named as a known gap).
      expect(rows(database, 'SELECT user_id FROM emergency_contacts WHERE user_id = ?', loserId)).toHaveLength(1)

      // The audit trail names the merge, against the losing account.
      const entry = rows<{ action: string, target: string }>(database,
        'SELECT action, target FROM audit_log WHERE action = ?', 'account.merged')[0]
      expect(entry?.target).toBe(`user:${loserId}`)
    })
  })

  test('an anonymised row is never written back over: a raced double merge changes nothing the second time', async () => {
    await withDatabase(async (database) => {
      const { winnerId, loserId } = seedDuplicate(database)
      await merge(database, winnerId, loserId)

      // The guard is the database's own, so it holds even if the application forgets to check.
      expect(() => database.batch([['UPDATE users SET name = ? WHERE id = ?', LOSER_NAME, loserId]])).toThrow()

      // A second attempt's tombstone matches nothing, so `changes()` is 0 and the conditional
      // audit insert this test appends stays unwritten (0049).
      const before = rows(database, 'SELECT id FROM audit_log').length
      const { mergeStatements, planGrantMerge } = await import('#shared/utils/account-merge')
      const now = Math.floor(Date.now() / 1000)
      const grantPlan = planGrantMerge([], [])
      const { tombstone } = mergeStatements({ winnerId, loserId, actorId: 'u-admin', grantPlan, trainingRecords: [], now })
      database.batch([
        boundStatement(database, tombstone),
        [`INSERT INTO audit_log (id, actor_id, action, target, detail)
          SELECT ?, ?, ?, ?, ? WHERE changes() = 1`, 'al-raced', 'u-admin', 'account.merged', `user:${loserId}`, null],
      ])
      expect(rows(database, 'SELECT id FROM audit_log').length).toBe(before)
    })
  })

  // A failure inside the batch leaves both accounts exactly as they were (A-123 criterion 3).
  test('a real constraint collision refuses the whole merge, not just the row that collided', async () => {
    await withDatabase(async (database) => {
      const { winnerId, loserId, moduleId, sessionId } = seedDuplicate(database)

      // The winner already holds a live record for the very session the loser's record names:
      // moving the loser's row onto the winner's id collides with `training_records_session_award`.
      database.batch([
        [`INSERT INTO training_records (id, user_id, module_id, session_id, awarded_on, source)
          VALUES (?, ?, ?, ?, '2026-09-20', 'SESSION')`, 'tr-winner', winnerId, moduleId, sessionId],
      ])

      const before = {
        bookings: rows(database, 'SELECT id FROM room_bookings WHERE user_id = ?', loserId).length,
        grants: rows(database, 'SELECT id FROM role_grants WHERE user_id = ?', loserId).length,
      }

      await expect(merge(database, winnerId, loserId)).rejects.toThrow()

      // Nothing moved: the whole batch is one transaction (0001, 0003).
      expect(rows(database, 'SELECT id FROM room_bookings WHERE user_id = ?', loserId).length).toBe(before.bookings)
      expect(rows(database, 'SELECT id FROM role_grants WHERE user_id = ?', loserId).length).toBe(before.grants)
      expect(rows(database, 'SELECT anonymised_at FROM users WHERE id = ?', loserId)[0]).toEqual({ anonymised_at: null })
    })
  })
})
