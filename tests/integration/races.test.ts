import { describe, expect, test } from 'bun:test'
import { createTestDatabase, rows } from '#tests/helpers/database'

// Named regression cases (K-121). Every claim below is proven by a test that fires concurrent
// requests and asserts one winner, never by a comment (K-105, 0006).
describe('contended invariants (K-105)', () => {
  test.todo('the capacity race: concurrent claims on the last seat leave exactly one ticket', () => {})
  test.todo('the register race: two submissions of one register produce exactly one set of awards', () => {})
  test.todo('a shift is claimable by exactly one person', () => {})

  // C-107's named case. This proves the claim is one guarded statement whose second execution
  // writes nothing; an in-process SQLite serialises, so not that it is atomic (0022).
  test('the slot race: the second claim on one span writes nothing', async () => {
    const database = await createTestDatabase()
    try {
      const now = Math.floor(Date.now() / 1000)
      database.batch([
        ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-booker', 'booker@example.invalid', 'A Booker'],
        ['INSERT INTO rooms (id, name) VALUES (?, ?)', 'r-studio', 'The Studio'],
      ])

      const claim = (id: string, startsAt: number, endsAt: number): number => {
        database.batch([[
          `INSERT INTO room_bookings (id, room_id, user_id, title, starts_at, ends_at, tier, status)
           SELECT ?, 'r-studio', 'u-booker', 'Rehearsal', ?, ?, 'GENERAL', 'CONFIRMED'
           WHERE NOT EXISTS (
             SELECT 1 FROM room_bookings
             WHERE room_id = 'r-studio' AND status IN ('CONFIRMED', 'PENDING_APPROVAL')
               AND starts_at < ? AND ends_at > ?
           )`,
          id, startsAt, endsAt, endsAt, startsAt,
        ]])
        return rows<{ n: number }>(database, 'SELECT count(*) n FROM room_bookings WHERE id = ?', id)[0]!.n
      }

      expect(claim('b-first', now + 3600, now + 7200)).toBe(1)
      expect(claim('b-second', now + 3600, now + 7200)).toBe(0)
      // Half-open: the one starting where the first ends is not a clash (criterion 5).
      expect(claim('b-after', now + 7200, now + 10800)).toBe(1)
    }
    finally {
      database.close()
    }
  })
  // G-122's named case. Revocation is idempotent, so the second attempt must write nothing and
  // log nothing rather than refuse: two administrators pressing the button is not an error.
  test('the revocation race: the second revocation writes no row and no second entry', async () => {
    const database = await createTestDatabase()
    try {
      database.batch([
        ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-held', 'held@example.invalid', 'A Member'],
        ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-admin', 'admin@example.invalid', 'An Officer'],
        ['INSERT INTO departments (code, name) VALUES (?, ?)', 'TECH', 'Technical'],
        ['INSERT INTO modules (id, department, kind, name) VALUES (?, ?, ?, ?)', 'TECH-111', 'TECH', 'MODULE', 'Working at height'],
        [`INSERT INTO training_records (id, user_id, module_id, awarded_on, source)
          VALUES ('tr-1', 'u-held', 'TECH-111', '2026-09-01', 'SIGNOFF')`],
      ])

      // The two statements the route runs, in the order it runs them: the entry first, because the
      // update would otherwise falsify the guard the entry rides on.
      const revoke = (entryId: string, at: number): void => {
        database.batch([
          [`INSERT INTO audit_log (id, actor_id, action, target, detail)
            SELECT ?, 'u-admin', 'record.revoked', 'user:u-held', '{"record":"tr-1"}'
            WHERE EXISTS (SELECT 1 FROM training_records WHERE id = 'tr-1' AND revoked_at IS NULL)`, entryId],
          [`UPDATE training_records SET revoked_at = ?, revoked_by = 'u-admin', revoke_reason = 'Found not competent'
            WHERE id = 'tr-1' AND revoked_at IS NULL`, at],
        ])
      }

      revoke('al-first', 1789000000)
      revoke('al-second', 1789999999)

      // One stamp, and it is the first one: the loser changed nothing.
      expect(rows<{ at: number }>(database, `SELECT revoked_at at FROM training_records WHERE id = 'tr-1'`)[0]?.at)
        .toBe(1789000000)
      expect(rows(database, `SELECT id FROM audit_log WHERE action = 'record.revoked'`)).toHaveLength(1)
      // Never deleted: the row is still there, still readable, still naming its award (criterion 5).
      expect(rows<{ awarded: string }>(database, `SELECT awarded_on awarded FROM training_records`)[0]?.awarded)
        .toBe('2026-09-01')
    }
    finally {
      database.close()
    }
  })

  test.todo('at most one confirmed duty manager per performance', () => {})
  test.todo('a promotion notification is sent at most once', () => {})
  test.todo('a sale\'s payment, lines and stock movements commit atomically', () => {})
})
