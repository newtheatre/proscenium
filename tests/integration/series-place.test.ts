import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { schema } from '@nuxthub/db'
import { seriesClaimStatement, seriesPlace } from '#server/utils/room-writes'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { TestDatabase } from '#tests/helpers/database'

// Rooms review, section 4: a term with a skipped week read "Week 4 of 3", and a series that waited
// on a decision kept no reason, so changing one week later demanded it again.

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    database.batch([
      ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u1', 'a@example.invalid', 'A Member'],
      ['INSERT INTO rooms (id, name) VALUES (?, ?)', 'r1', 'The Studio'],
      [`INSERT INTO room_series (id, user_id, room_id, title, frequency, weekdays, starts_on, clock_from, clock_to, occurrences)
        VALUES ('s1', 'u1', 'r1', 'Rehearsal', 'WEEKLY', '1', '2026-11-02', '19:00', '21:00', 3)`],
    ])
    await fn(database)
  }
  finally {
    database.close()
  }
}

const OFFSETS = { startBeforeDoorsMinutes: 30, endAfterEndMinutes: 30 }

function placed(database: TestDatabase): { id: string, occurrence: number | null, length: number | null }[] {
  const place = seriesPlace()
  const query = database.db.select({ id: schema.roomBookings.id, occurrence: place.occurrence.as('occurrence'), length: place.length.as('length') })
    .from(schema.roomBookings)
    .where(eq(schema.roomBookings.userId, 'u1'))
    .orderBy(schema.roomBookings.startsAt)
  const [statement, ...parameters] = boundStatement(database, query.getSQL())
  return rows(database, statement, ...parameters)
}

describe('a date is numbered among the dates its series holds', () => {
  test('a term stored with the old numbering reads by its rows, and a single booking has no place', async () => {
    await withDatabase((database) => {
      // Week 2 was skipped before renumbering existed, so the stored numbers run 1, 3, 4.
      database.batch([
        ...[[1, 1000], [3, 3000], [4, 4000]].map(([occurrence, at]) => [
          `INSERT INTO room_bookings (id, room_id, user_id, title, starts_at, ends_at, tier, status, series_id, occurrence)
           VALUES (?, 'r1', 'u1', 'Rehearsal', ?, ?, 'GENERAL', 'CONFIRMED', 's1', ?)`,
          `b${occurrence}`, at, at! + 500, occurrence,
        ] as [string, ...unknown[]]),
        [`INSERT INTO room_bookings (id, room_id, user_id, title, starts_at, ends_at, tier, status)
          VALUES ('single', 'r1', 'u1', 'Meeting', 5000, 5500, 'GENERAL', 'CONFIRMED')`],
      ])

      expect(placed(database)).toEqual([
        { id: 'b1', occurrence: 1, length: 3 },
        { id: 'b3', occurrence: 2, length: 3 },
        { id: 'b4', occurrence: 3, length: 3 },
        { id: 'single', occurrence: null, length: null },
      ])
    })
  })
})

describe('a series waiting on a decision keeps its reason on every date', () => {
  test('the claim writes the reason it was given', async () => {
    await withDatabase((database) => {
      const series = { seriesId: 's1', userId: 'u1', roomId: 'r1', title: 'Rehearsal', attendees: null, tier: 'REHEARSAL', purpose: 'REHEARSAL', notes: null, reason: 'Opening week.', status: 'PENDING_APPROVAL' as const, offsets: OFFSETS }
      const at = Date.UTC(2026, 10, 2, 19)
      const occurrence = { occurrence: 1, day: '2026-11-02', startsAt: new Date(at), endsAt: new Date(at + 7_200_000) }
      const [statement, ...parameters] = boundStatement(database, seriesClaimStatement('b-week-1', series, occurrence))
      database.batch([[statement, ...parameters]])

      expect(rows<{ reason: string | null }>(database, 'SELECT reason FROM room_bookings WHERE id = ?', 'b-week-1'))
        .toEqual([{ reason: 'Opening week.' }])
    })
  })
})
