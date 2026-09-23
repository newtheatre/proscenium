import { describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import { filterQuerySchema } from '#shared/utils/list-filters'
import { roomBookingsList } from '#shared/utils/room-bookings-list'
import { bookingsClause, standingNoShow } from '#server/utils/room-bookings-list'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import type { ListQuery } from '#shared/utils/list-filters'
import type { TestDatabase } from '#tests/helpers/database'

// The officer's bookings list through its declaration, against the real migrations (C-115
// criterion 6, K-129, issue 1049).

const NOW = 1_800_000_000
const HOUR = 3600

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    await fn(database)
  }
  finally {
    database.close()
  }
}

const parsed = (query: Record<string, string>): ListQuery => {
  const result = filterQuerySchema(roomBookingsList).safeParse(query)
  if (!result.success) throw new Error(result.error.issues.map(issue => issue.message).join('; '))
  return result.data
}

function seed(database: TestDatabase): void {
  database.batch([
    ['INSERT INTO users (id, email, name) VALUES (?, ?, ?)', 'u-ada', 'ada@example.invalid', 'Ada Lovelace'],
    ['INSERT INTO users (id, email, name) VALUES (?, ?, ?)', 'u-bea', 'bea@example.invalid', 'Bea Rehearsal'],
    ['INSERT INTO rooms (id, name) VALUES (?, ?)', 'r-studio', 'The Studio'],
    ['INSERT INTO rooms (id, name) VALUES (?, ?)', 'r-green', 'Green Room'],
    ['INSERT INTO room_bookings (id, room_id, user_id, title, tier, status, starts_at, ends_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      'b-soon', 'r-studio', 'u-ada', 'Line run', 'GENERAL', 'CONFIRMED', NOW + HOUR, NOW + 2 * HOUR],
    ['INSERT INTO room_bookings (id, room_id, user_id, title, tier, status, starts_at, ends_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      'b-later', 'r-green', 'u-bea', 'Dance call', 'REHEARSAL', 'PENDING_APPROVAL', NOW + 10 * HOUR, NOW + 11 * HOUR],
    ['INSERT INTO room_bookings (id, room_id, user_id, title, tier, status, starts_at, ends_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      'b-missed', 'r-studio', 'u-bea', 'Read-through', 'GENERAL', 'CONFIRMED', NOW - 5 * HOUR, NOW - 4 * HOUR],
    ['INSERT INTO room_bookings (id, room_id, user_id, title, tier, status, starts_at, ends_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      'b-withdrawn', 'r-green', 'u-ada', 'Costume fitting', 'GENERAL', 'CONFIRMED', NOW - 3 * HOUR, NOW - 2 * HOUR],
    ['INSERT INTO room_no_shows (id, booking_id, user_id, kind, recorded_at) VALUES (?, ?, ?, ?, ?)',
      'n-missed', 'b-missed', 'u-bea', 'RECORDED', NOW - HOUR],
    ['INSERT INTO room_no_shows (id, booking_id, user_id, kind, recorded_at) VALUES (?, ?, ?, ?, ?)',
      'n-wrong', 'b-withdrawn', 'u-ada', 'RECORDED', NOW - HOUR],
    ['INSERT INTO room_no_shows (id, booking_id, user_id, kind, supersedes_id, recorded_at) VALUES (?, ?, ?, ?, ?, ?)',
      'n-withdrawal', 'b-withdrawn', 'u-ada', 'WITHDRAWN', 'n-wrong', NOW - HOUR],
  ])
}

// The endpoint's own joins: rooms and users, whose names the search runs over.
function listed(database: TestDatabase, query: Record<string, string>): { id: string, noShowId: string | null }[] {
  const clause = bookingsClause(parsed(query), NOW)
  const statement = sql`SELECT room_bookings.id AS id, ${standingNoShow} AS noShowId FROM room_bookings
    JOIN rooms ON rooms.id = room_bookings.room_id
    JOIN users ON users.id = room_bookings.user_id
    ${clause.where ? sql`WHERE ${clause.where}` : sql``}
    ORDER BY ${sql.join(clause.orderBy, sql`, `)}`
  const [text, ...parameters] = boundStatement(database, statement)
  return rows<{ id: string, noShowId: string | null }>(database, text, ...parameters)
}

const ids = (database: TestDatabase, query: Record<string, string>): string[] => listed(database, query).map(row => row.id)

describe('the bookings list hides what has ended until asked (C-115 criterion 6)', () => {
  test('an empty query lists what is still to come, soonest first', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(ids(database, {})).toEqual(['b-soon', 'b-later'])
    })
  })

  test('the past filter shows what has ended, and the direction flips it', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(ids(database, { past: 'true' })).toEqual(['b-missed', 'b-withdrawn'])
      expect(ids(database, { past: 'true', direction: 'desc' })).toEqual(['b-withdrawn', 'b-missed'])
      expect(ids(database, { past: 'false' })).toEqual(['b-soon', 'b-later'])
    })
  })
})

describe('the bookings list filters on its declaration (K-129)', () => {
  test('by state, room, member and kind of booking', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(ids(database, { status: 'is:PENDING_APPROVAL' })).toEqual(['b-later'])
      expect(ids(database, { room: 'is:r-studio', past: 'true' })).toEqual(['b-missed'])
      expect(ids(database, { member: 'is:u-ada' })).toEqual(['b-soon'])
      expect(ids(database, { tier: 'is:REHEARSAL' })).toEqual(['b-later'])
    })
  })

  test('the search runs over the title, the member and the room', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(ids(database, { search: 'dance' })).toEqual(['b-later'])
      expect(ids(database, { search: 'lovelace' })).toEqual(['b-soon'])
      expect(ids(database, { search: 'green room' })).toEqual(['b-later'])
    })
  })

  test('a state the declaration does not name is refused', () => {
    expect(filterQuerySchema(roomBookingsList).safeParse({ status: 'is:LOST' }).success).toBe(false)
  })
})

describe('a standing no-show is the latest entry, as the ladder counts it (C-116 criterion 2)', () => {
  test('a withdrawn no-show no longer stands, and a recorded one names its record', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(listed(database, { past: 'true' })).toEqual([
        { id: 'b-missed', noShowId: 'n-missed' },
        { id: 'b-withdrawn', noShowId: null },
      ])
    })
  })

  test('asking for no-shows lists the past ones without asking for the past as well', async () => {
    await withDatabase((database) => {
      seed(database)
      expect(ids(database, { noShow: 'true' })).toEqual(['b-missed'])
    })
  })
})
