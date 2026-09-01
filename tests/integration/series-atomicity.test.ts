import { describe, expect, test } from 'bun:test'
import { createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// Named regression case (K-121), on the real migrations. A guarded INSERT that matches nothing
// raises nothing, so a partial series is the failure to prove against (C-110 criterion 3, 0035).

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

function seed(database: TestDatabase): void {
  database.batch([
    ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u1', 'a@example.invalid', 'A Member'],
    ['INSERT INTO rooms (id, name) VALUES (?, ?)', 'r1', 'The Studio'],
  ])
}

const SERIES = `INSERT INTO room_series
  (id, user_id, room_id, title, frequency, starts_on, clock_from, clock_to, occurrences, head_booking_id)
  SELECT 's1', 'u1', 'r1', 'Rehearsal', 'WEEKLY', '2026-03-16', '19:00', '21:00', ?, 'b1'`

const claim = (id: string, from: number, to: number): [string, ...unknown[]] => [
  `INSERT INTO room_bookings (id, room_id, user_id, title, starts_at, ends_at, tier, status, series_id, occurrence)
   SELECT ?, 'r1', 'u1', 'Rehearsal', ?, ?, 'GENERAL', 'CONFIRMED', 's1', ?
   WHERE NOT EXISTS (
     SELECT 1 FROM room_bookings
     WHERE room_id = 'r1' AND status IN ('CONFIRMED', 'PENDING_APPROVAL')
       AND starts_at < ? AND ends_at > ?
   )`,
  id, from, to, Number(id.slice(1)), to, from,
]

const assertion = (expected: number): [string, ...unknown[]] => [
  `INSERT INTO room_series (id, user_id, room_id, title, frequency, starts_on, clock_from, clock_to, occurrences)
   SELECT 's1', 'u1', 'r1', 'Rehearsal', 'WEEKLY', '2026-03-16', '19:00', '21:00', ?
   WHERE (SELECT count(*) FROM room_bookings WHERE series_id = 's1') <> ?`,
  expected, expected,
]

describe('a series is written whole or not at all (C-110 criterion 3)', () => {
  test('every occurrence free: the series and all of them land', async () => {
    await withDatabase((database) => {
      seed(database)
      database.batch([
        [SERIES, 3],
        claim('b1', 1000, 2000),
        claim('b2', 11_000, 12_000),
        claim('b3', 21_000, 22_000),
        assertion(3),
      ])

      expect(rows(database, `SELECT id FROM room_bookings WHERE series_id = 's1'`)).toHaveLength(3)
      expect(rows(database, `SELECT id FROM room_series WHERE id = 's1'`)).toHaveLength(1)
    })
  })

  // The case the assertion exists for: somebody claims one occurrence's slot between the check
  // and the write, so one guarded insert writes nothing and the rest would stand without it.
  test('one occurrence beaten to its slot rolls the whole series back', async () => {
    await withDatabase((database) => {
      seed(database)
      database.batch([
        [`INSERT INTO room_bookings (id, room_id, user_id, title, starts_at, ends_at, tier, status)
          VALUES ('taken', 'r1', 'u1', 'Somebody else', 11_500, 11_800, 'GENERAL', 'CONFIRMED')`],
      ])

      expect(() => database.batch([
        [SERIES, 3],
        claim('b1', 1000, 2000),
        claim('b2', 11_000, 12_000),
        claim('b3', 21_000, 22_000),
        assertion(3),
      ])).toThrow()

      // Nothing of the series survives, not even the occurrences that were free.
      expect(rows(database, `SELECT id FROM room_bookings WHERE series_id = 's1'`)).toHaveLength(0)
      expect(rows(database, `SELECT id FROM room_series WHERE id = 's1'`)).toHaveLength(0)
      // The booking that beat it is untouched.
      expect(rows(database, `SELECT id FROM room_bookings WHERE id = 'taken'`)).toHaveLength(1)
    })
  })

  test('the last occurrence beaten rolls it back too', async () => {
    await withDatabase((database) => {
      seed(database)
      database.batch([
        [`INSERT INTO room_bookings (id, room_id, user_id, title, starts_at, ends_at, tier, status)
          VALUES ('taken', 'r1', 'u1', 'Somebody else', 21_100, 21_900, 'GENERAL', 'CONFIRMED')`],
      ])

      expect(() => database.batch([
        [SERIES, 3],
        claim('b1', 1000, 2000),
        claim('b2', 11_000, 12_000),
        claim('b3', 21_000, 22_000),
        assertion(3),
      ])).toThrow()

      expect(rows(database, `SELECT id FROM room_bookings WHERE series_id = 's1'`)).toHaveLength(0)
    })
  })

  // A cancelled booking holds no slot, so it is not in the way of a series over it.
  test('a cancelled booking in the span is not a clash', async () => {
    await withDatabase((database) => {
      seed(database)
      database.batch([
        [`INSERT INTO room_bookings (id, room_id, user_id, title, starts_at, ends_at, tier, status)
          VALUES ('gone', 'r1', 'u1', 'Called off', 11_500, 11_800, 'GENERAL', 'CANCELLED')`],
      ])

      database.batch([[SERIES, 2], claim('b1', 1000, 2000), claim('b2', 11_000, 12_000), assertion(2)])
      expect(rows(database, `SELECT id FROM room_bookings WHERE series_id = 's1'`)).toHaveLength(2)
    })
  })
})

describe('the head is the earliest occurrence still standing (C-111 criterion 3)', () => {
  const promote = `UPDATE room_series SET head_booking_id = (
      SELECT id FROM room_bookings
      WHERE series_id = 's1' AND status IN ('CONFIRMED', 'PENDING_APPROVAL')
      ORDER BY starts_at LIMIT 1
    ) WHERE id = 's1'`

  function threeWeeks(database: TestDatabase): void {
    seed(database)
    database.batch([
      [SERIES, 3],
      claim('b1', 1000, 2000),
      claim('b2', 11_000, 12_000),
      claim('b3', 21_000, 22_000),
      assertion(3),
    ])
  }

  const head = (database: TestDatabase): string | null =>
    (rows<{ head: string | null }>(database, `SELECT head_booking_id AS head FROM room_series WHERE id = 's1'`)[0]?.head) ?? null

  test('cancelling the head promotes the next, in the same batch', async () => {
    await withDatabase((database) => {
      threeWeeks(database)
      expect(head(database)).toBe('b1')

      database.batch([
        [`UPDATE room_bookings SET status = 'CANCELLED' WHERE id = 'b1' AND status IN ('CONFIRMED', 'PENDING_APPROVAL')`],
        [promote],
      ])

      expect(head(database)).toBe('b2')
    })
  })

  test('cancelling one in the middle leaves the head alone', async () => {
    await withDatabase((database) => {
      threeWeeks(database)
      database.batch([
        [`UPDATE room_bookings SET status = 'CANCELLED' WHERE id = 'b2' AND status IN ('CONFIRMED', 'PENDING_APPROVAL')`],
        [promote],
      ])

      expect(head(database)).toBe('b1')
    })
  })

  test('cancelling the whole series leaves it headless rather than pointing at a dead week', async () => {
    await withDatabase((database) => {
      threeWeeks(database)
      database.batch([
        [`UPDATE room_bookings SET status = 'CANCELLED'
          WHERE series_id = 's1' AND status IN ('CONFIRMED', 'PENDING_APPROVAL')`],
        [promote],
      ])

      expect(head(database)).toBeNull()
      expect(rows(database, `SELECT id FROM room_bookings WHERE series_id = 's1' AND status = 'CANCELLED'`)).toHaveLength(3)
    })
  })
})
