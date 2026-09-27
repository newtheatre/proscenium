import { describe, expect, test } from 'bun:test'
import { approveStatement } from '#server/utils/approvals'
import { claimRoomSlotStatement } from '#server/utils/bookings'
import { bumpStatements, seriesClaimStatement } from '#server/utils/room-writes'
import { showNightBounds, showNightOf } from '#shared/utils/show-night'
import { boundStatement, createTestDatabase, rows } from '#tests/helpers/database'
import { tonightsPerformance } from '#tests/helpers/programme'
import { race } from '#tests/helpers/race'
import type { ClaimInput } from '#server/utils/bookings'
import type { TestDatabase } from '#tests/helpers/database'
import type { SQL } from 'drizzle-orm'

// The closure race (0003): a closure made between a route's closure check and its claim must still
// stop the claim, so the closures ride the INSERT with the clash rule rather than a read before it.

const NIGHT = showNightOf(new Date('2026-10-06T12:00:00Z'))
const NIGHT_START = Math.floor(showNightBounds(NIGHT).from.getTime() / 1000)
const OFFSETS = { startBeforeDoorsMinutes: 30, endAfterEndMinutes: 30 }
// 19:30 curtain, doors 19:00, two hours: the performance closes the room from 18:30 to 22:00.
const CURTAIN_HOURS = 15.5
const EVENING = { startsAt: NIGHT_START + 14 * 3600, endsAt: NIGHT_START + 16 * 3600 }
const AFTERNOON = { startsAt: NIGHT_START + 8 * 3600, endsAt: NIGHT_START + 10 * 3600 }
const NOW_SECONDS = NIGHT_START - 7 * 86_400

async function withDatabase(fn: (database: TestDatabase) => void | Promise<void>): Promise<void> {
  const database = await createTestDatabase()
  try {
    database.batch([
      ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'u-booker', 'booker@example.invalid', 'A Booker'],
      ['INSERT INTO rooms (id, name) VALUES (?, ?)', 'r-house', 'The Auditorium'],
      ['INSERT INTO rooms (id, name) VALUES (?, ?)', 'r-studio', 'The Studio'],
    ])
    await fn(database)
  }
  finally {
    database.close()
  }
}

function input(span: { startsAt: number, endsAt: number }, roomId = 'r-house'): ClaimInput {
  return {
    roomId,
    userId: 'u-booker',
    title: 'Rehearsal',
    attendees: null,
    tier: 'REHEARSAL',
    purpose: 'REHEARSAL',
    status: 'CONFIRMED',
    notes: null,
    offsets: OFFSETS,
    ...span,
  }
}

// Written or not, read back by id: the statement's RETURNING is the route's signal, and this is its twin.
function claim(database: TestDatabase, id: string, over: ClaimInput): boolean {
  const [query, ...parameters] = boundStatement(database, claimRoomSlotStatement(id, over))
  database.raw.prepare(query).all(...parameters as never[])
  return rows<{ n: number }>(database, 'SELECT count(*) n FROM room_bookings WHERE id = ?', id)[0]!.n === 1
}

function closeRoom(database: TestDatabase, roomId: string | null, span: { startsAt: number, endsAt: number }): void {
  database.batch([['INSERT INTO room_blackouts (id, room_id, reason, starts_at, ends_at) VALUES (?, ?, ?, ?, ?)',
    `bo-${crypto.randomUUID().slice(0, 8)}`, roomId, 'Get-in', span.startsAt, span.endsAt]])
}

describe('a closure made after the check still stops the claim', () => {
  test('an open room is claimed', async () => {
    await withDatabase((database) => {
      expect(claim(database, 'b-open', input(EVENING))).toBe(true)
    })
  })

  test('an officer\'s closure of the room, or of every room, writes nothing', async () => {
    await withDatabase((database) => {
      closeRoom(database, 'r-house', EVENING)
      expect(claim(database, 'b-room', input(EVENING))).toBe(false)
      closeRoom(database, null, AFTERNOON)
      expect(claim(database, 'b-every', input(AFTERNOON, 'r-studio'))).toBe(false)
    })
  })

  test('a closure ending as the booking starts is no clash (half-open, as the clash rule is)', async () => {
    await withDatabase((database) => {
      closeRoom(database, 'r-house', { startsAt: EVENING.startsAt - 3600, endsAt: EVENING.startsAt })
      expect(claim(database, 'b-after', input(EVENING))).toBe(true)
    })
  })

  test('a performance at the venue the room belongs to writes nothing over its window', async () => {
    await withDatabase((database) => {
      tonightsPerformance(database, { night: NIGHT, suffix: 'house', roomId: 'r-house', curtainHoursAfterNightStart: CURTAIN_HOURS })
      expect(claim(database, 'b-show', input({ startsAt: NIGHT_START + 16 * 3600, endsAt: NIGHT_START + 17 * 3600 }))).toBe(false)
      expect(claim(database, 'b-afternoon', input(AFTERNOON))).toBe(true)
      expect(claim(database, 'b-studio', input({ startsAt: NIGHT_START + 16 * 3600, endsAt: NIGHT_START + 17 * 3600 }, 'r-studio'))).toBe(true)
    })
  })

  test('a cancelled performance closes nothing', async () => {
    await withDatabase((database) => {
      tonightsPerformance(database, { night: NIGHT, suffix: 'off', roomId: 'r-house', status: 'CANCELLED', curtainHoursAfterNightStart: CURTAIN_HOURS })
      expect(claim(database, 'b-free', input({ startsAt: NIGHT_START + 16 * 3600, endsAt: NIGHT_START + 17 * 3600 }))).toBe(true)
    })
  })

  // The race itself: the route reads the room open, an officer closes it, then the claim runs. A
  // read-then-write would book into the closure; the predicate on the INSERT does not.
  test('a closure landing between the route\'s check and its claim leaves the claim unwritten', async () => {
    await withDatabase(async (database) => {
      const open = rows<{ n: number }>(database,
        `SELECT count(*) n FROM room_blackouts WHERE (room_id = 'r-house' OR room_id IS NULL) AND starts_at < ? AND ends_at > ?`,
        EVENING.endsAt, EVENING.startsAt)[0]!.n
      expect(open).toBe(0)

      closeRoom(database, 'r-house', EVENING)
      const written = await race(5, async index => claim(database, `b-race-${index}`, input(EVENING)))
      expect(written.filter(Boolean)).toHaveLength(0)
    })
  })

  test('the statement binds the same parameters however many closures there are (0006)', async () => {
    await withDatabase((database) => {
      const before = boundStatement(database, claimRoomSlotStatement('b-count', input(EVENING))).length
      closeRoom(database, 'r-house', AFTERNOON)
      closeRoom(database, null, AFTERNOON)
      expect(boundStatement(database, claimRoomSlotStatement('b-count', input(EVENING))).length).toBe(before)
    })
  })
})

// The same race for every other write that places a booking (0003): the route read the room open,
// an officer closed it, and the write that follows writes nothing.
function write(database: TestDatabase, statement: SQL): number {
  const [query, ...parameters] = boundStatement(database, statement)
  return rows(database, query, ...parameters).length
}

function booking(database: TestDatabase, id: string, status: string, span: { startsAt: number, endsAt: number }, roomId = 'r-house'): void {
  database.batch([[`INSERT INTO room_bookings (id, room_id, user_id, title, starts_at, ends_at, tier, purpose, status)
    VALUES (?, ?, 'u-booker', 'Rehearsal', ?, ?, 'REHEARSAL', 'REHEARSAL', ?)`, id, roomId, span.startsAt, span.endsAt, status]])
}

const statusOf = (database: TestDatabase, id: string): string | undefined =>
  rows<{ status: string }>(database, 'SELECT status FROM room_bookings WHERE id = ?', id)[0]?.status

describe('every other write that places a booking holds the closures too', () => {
  test('approving a request into a room closed after the check writes nothing', async () => {
    await withDatabase((database) => {
      booking(database, 'b-asked', 'PENDING_APPROVAL', EVENING)
      closeRoom(database, 'r-house', EVENING)
      expect(write(database, approveStatement('b-asked', 'u-booker', null, NOW_SECONDS, OFFSETS))).toBe(0)
      expect(statusOf(database, 'b-asked')).toBe('PENDING_APPROVAL')
    })
  })

  test('moving a request into a room a performance closes writes nothing, and into an open one lands', async () => {
    await withDatabase((database) => {
      booking(database, 'b-moving', 'PENDING_APPROVAL', { startsAt: NIGHT_START + 16 * 3600, endsAt: NIGHT_START + 17 * 3600 }, 'r-studio')
      tonightsPerformance(database, { night: NIGHT, suffix: 'house', roomId: 'r-house', curtainHoursAfterNightStart: CURTAIN_HOURS })
      expect(write(database, approveStatement('b-moving', 'u-booker', 'r-house', NOW_SECONDS, OFFSETS))).toBe(0)
      expect(write(database, approveStatement('b-moving', 'u-booker', null, NOW_SECONDS, OFFSETS))).toBe(1)
    })
  })

  test('a bump over a closure made after the check bumps nobody and hands nobody the slot', async () => {
    await withDatabase((database) => {
      booking(database, 'b-standing', 'CONFIRMED', EVENING)
      closeRoom(database, 'r-house', EVENING)
      for (const statement of bumpStatements({
        displaced: { id: 'b-standing', roomId: 'r-house', userId: 'u-booker', title: 'Rehearsal', attendees: null, tier: 'REHEARSAL', purpose: 'REHEARSAL', ...EVENING },
        claimantId: 'u-booker',
        title: 'Dress run',
        tier: 'PRODUCTION',
        purpose: 'REHEARSAL',
        reason: 'Show week',
        offer: undefined,
        now: NOW_SECONDS,
        offsets: OFFSETS,
      }, 'b-claimant', null)) write(database, statement)
      expect(statusOf(database, 'b-standing')).toBe('CONFIRMED')
      expect(statusOf(database, 'b-claimant')).toBeUndefined()
    })
  })

  // The bump lands but its held offer does not: the displaced member must not be told of a slot
  // that was never written, so the link to it is cleared in the same batch.
  test('an offer whose room closed after the check is not written, and nothing points at it', async () => {
    await withDatabase((database) => {
      booking(database, 'b-standing', 'CONFIRMED', EVENING)
      closeRoom(database, 'r-studio', AFTERNOON)
      for (const statement of bumpStatements({
        displaced: { id: 'b-standing', roomId: 'r-house', userId: 'u-booker', title: 'Rehearsal', attendees: null, tier: 'REHEARSAL', purpose: 'REHEARSAL', ...EVENING },
        claimantId: 'u-booker',
        title: 'Dress run',
        tier: 'PRODUCTION',
        purpose: 'REHEARSAL',
        reason: 'Show week',
        offer: { roomId: 'r-studio', room: 'The Studio', capacity: null, ...AFTERNOON },
        now: NOW_SECONDS,
        offsets: OFFSETS,
      }, 'b-claimant', 'b-offer')) write(database, statement)
      expect(statusOf(database, 'b-standing')).toBe('BUMPED')
      expect(statusOf(database, 'b-claimant')).toBe('CONFIRMED')
      expect(statusOf(database, 'b-offer')).toBeUndefined()
      expect(rows<{ link: string | null }>(database, 'SELECT bumped_to_booking_id link FROM room_bookings WHERE id = ?', 'b-standing')[0]!.link).toBeNull()
    })
  })

  test('a series occurrence under a closure made after the check writes nothing', async () => {
    await withDatabase((database) => {
      database.batch([[`INSERT INTO room_series (id, user_id, room_id, title, frequency, starts_on, clock_from, clock_to, occurrences)
        VALUES ('s-term', 'u-booker', 'r-house', 'Rehearsal', 'WEEKLY', ?, '18:00', '20:00', 1)`, NIGHT]])
      closeRoom(database, 'r-house', EVENING)
      const occurrence = { occurrence: 1, day: NIGHT, startsAt: new Date(EVENING.startsAt * 1000), endsAt: new Date(EVENING.endsAt * 1000) }
      const series = { seriesId: 's-term', userId: 'u-booker', roomId: 'r-house', title: 'Rehearsal', attendees: null, tier: 'REHEARSAL', purpose: 'REHEARSAL', notes: null, status: 'CONFIRMED' as const, offsets: OFFSETS }
      write(database, seriesClaimStatement('b-week-1', series, occurrence))
      expect(statusOf(database, 'b-week-1')).toBeUndefined()
    })
  })
})
