import { describe, expect, test } from 'bun:test'
import { createTestDatabase, rows } from '#tests/helpers/database'

// A named regression case (K-121), not one of K-105's four invariants: the slot claim predicate
// rides the INSERT, so the loser writes nothing rather than an application read-then-write.
describe('contended invariants (K-105)', () => {
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
})
