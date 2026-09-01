import { describe, expect, test } from 'bun:test'
import { createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// Named regression case (K-121), on the real migrations. A no-show is a fact about a night: the
// guard is the database's, so it holds for a handler nobody has written yet (0010, C-116).

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
    [`INSERT INTO room_bookings (id, room_id, user_id, title, starts_at, ends_at, tier, status)
      VALUES ('b1', 'r1', 'u1', 'Rehearsal', 1000, 2000, 'GENERAL', 'CONFIRMED')`],
    [`INSERT INTO room_no_shows (id, booking_id, user_id, kind, recorded_by, recorded_at)
      VALUES ('n1', 'b1', 'u1', 'RECORDED', 'u1', 3000)`],
  ])
}

describe('a no-show is append-only (criterion 2)', () => {
  test('it cannot be edited', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(() => database.batch([[`UPDATE room_no_shows SET kind = 'WITHDRAWN' WHERE id = 'n1'`]])).toThrow()
      expect(rows<{ kind: string }>(database, `SELECT kind FROM room_no_shows WHERE id = 'n1'`)[0]?.kind)
        .toBe('RECORDED')
    })
  })

  test('it cannot be deleted', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(() => database.batch([[`DELETE FROM room_no_shows WHERE id = 'n1'`]])).toThrow()
      expect(rows(database, 'SELECT id FROM room_no_shows')).toHaveLength(1)
    })
  })

  test('a correction is a second row naming what it supersedes', async () => {
    await withDatabase((database) => {
      seed(database)
      database.batch([
        [`INSERT INTO room_no_shows (id, booking_id, user_id, kind, reason, supersedes_id, recorded_by, recorded_at)
          VALUES ('n2', 'b1', 'u1', 'WITHDRAWN', 'Recorded against the wrong booking', 'n1', 'u1', 4000)`],
      ])

      const both = rows<{ id: string, kind: string }>(database,
        'SELECT id, kind FROM room_no_shows ORDER BY recorded_at')
      expect(both).toHaveLength(2)
      // The original stands as it was written; the correction sits on top of it.
      expect(both[0]).toMatchObject({ id: 'n1', kind: 'RECORDED' })
      expect(both[1]).toMatchObject({ id: 'n2', kind: 'WITHDRAWN' })
    })
  })

  test('the booking it is about cannot be deleted out from under it', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(() => database.batch([[`DELETE FROM room_bookings WHERE id = 'b1'`]])).toThrow()
    })
  })
})
