import { and, eq, inArray, sql } from 'drizzle-orm'
import { HOLDS_A_SLOT } from '#shared/utils/bookings'
import { LIVE_EXTERNAL } from '#shared/utils/external-requests'
import type { Conflict } from '#shared/utils/bookings'
import type { Occurrence, Recurrence } from '#shared/utils/series'
import type { Failure } from '#shared/utils/booking-policy'

// Writing a whole series or none of it (C-110 criteria 2 and 3). D1 has no interactive
// transaction, so the all-or-nothing shape is a batch and an assertion inside it (0035).

export interface OccurrenceRefusal {
  occurrence: number
  day: string
  failures: Failure[]
  conflicts: Conflict[]
}

export interface SeriesWrite {
  seriesId: string
  userId: string
  roomId: string
  title: string
  attendees: number | null
  tier: string
  purpose: string
  notes: string | null
  status: 'CONFIRMED' | 'PENDING_APPROVAL'
  recurrence: Recurrence
  occurrences: Occurrence[]
}

// What each occurrence conflicts with, read once for the whole span rather than once per
// occurrence: a term of twelve is twelve round trips otherwise.
export async function conflictsAcross(roomId: string, occurrences: Occurrence[]): Promise<Map<number, Conflict[]>> {
  const found = new Map<number, Conflict[]>()
  if (occurrences.length === 0) return found

  const earliest = Math.min(...occurrences.map(one => Math.floor(one.startsAt.getTime() / 1000)))
  const latest = Math.max(...occurrences.map(one => Math.floor(one.endsAt.getTime() / 1000)))

  const rows = await db.select({
    startsAt: schema.roomBookings.startsAt,
    endsAt: schema.roomBookings.endsAt,
    title: schema.roomBookings.title,
    bookedBy: schema.users.name,
  })
    .from(schema.roomBookings)
    .leftJoin(schema.users, eq(schema.users.id, schema.roomBookings.userId))
    .where(and(
      eq(schema.roomBookings.roomId, roomId),
      inArray(schema.roomBookings.status, [...HOLDS_A_SLOT]),
      sql`${schema.roomBookings.startsAt} < ${latest}`,
      sql`${schema.roomBookings.endsAt} > ${earliest}`,
    ))

  for (const one of occurrences) {
    const from = Math.floor(one.startsAt.getTime() / 1000)
    const to = Math.floor(one.endsAt.getTime() / 1000)
    const clashing = rows.filter(row => row.startsAt < to && row.endsAt > from)
    if (clashing.length > 0) {
      found.set(one.occurrence, clashing.map(row => ({
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        title: row.title,
        bookedBy: row.bookedBy ?? undefined,
      })))
    }
  }

  return found
}

// Every occurrence claimed under its own clash predicate, then an assertion they all landed: a
// short count re-inserts the series row onto its own primary key, failing the batch (0035).
export async function writeSeries(write: SeriesWrite): Promise<{ ids: string[] }> {
  const ids = write.occurrences.map(() => newId())
  const held = HOLDS_A_SLOT.map(status => sql`${status}`)
  const weekdays = write.recurrence.frequency === 'WEEKLY'
    ? [...write.recurrence.weekdays].sort((a, b) => a - b).join(',')
    : null

  const seriesRow = sql`
    INSERT INTO room_series
      (id, user_id, room_id, title, frequency, weekdays, starts_on, clock_from, clock_to, occurrences, head_booking_id)
    SELECT ${write.seriesId}, ${write.userId}, ${write.roomId}, ${write.title}, ${write.recurrence.frequency},
           ${weekdays}, ${write.recurrence.startsOn}, ${write.recurrence.from}, ${write.recurrence.to},
           ${write.occurrences.length}, ${ids[0] ?? null}
  `

  const claims = write.occurrences.map((one, at) => sql`
    INSERT INTO room_bookings
      (id, room_id, user_id, title, attendees, starts_at, ends_at, tier, purpose, status, notes, series_id, occurrence)
    SELECT ${ids[at]}, ${write.roomId}, ${write.userId}, ${write.title}, ${write.attendees},
           ${Math.floor(one.startsAt.getTime() / 1000)}, ${Math.floor(one.endsAt.getTime() / 1000)},
           ${write.tier}, ${write.purpose}, ${write.status}, ${write.notes}, ${write.seriesId}, ${one.occurrence}
    WHERE EXISTS (SELECT 1 FROM rooms WHERE id = ${write.roomId} AND is_active = 1)
      AND NOT EXISTS (
        SELECT 1 FROM room_bookings
        WHERE room_id = ${write.roomId}
          AND status IN (${sql.join(held, sql`, `)})
          AND starts_at < ${Math.floor(one.endsAt.getTime() / 1000)}
          AND ends_at > ${Math.floor(one.startsAt.getTime() / 1000)}
      )
  `)

  // Reached only when an occurrence was beaten to its slot between the check and the write.
  const assertion = sql`
    INSERT INTO room_series (id, user_id, room_id, title, frequency, starts_on, clock_from, clock_to, occurrences)
    SELECT ${write.seriesId}, ${write.userId}, ${write.roomId}, ${write.title}, ${write.recurrence.frequency},
           ${write.recurrence.startsOn}, ${write.recurrence.from}, ${write.recurrence.to}, ${write.occurrences.length}
    WHERE (SELECT count(*) FROM room_bookings WHERE series_id = ${write.seriesId}) <> ${write.occurrences.length}
  `

  await db.batch([
    db.run(seriesRow),
    ...claims.map(claim => db.run(claim)),
    db.run(assertion),
  ] as unknown as Parameters<typeof db.batch>[0])

  return { ids }
}

export interface SeriesRow {
  id: string
  userId: string
  roomId: string
  room: string
  title: string
  frequency: string
  weekdays: string | null
  startsOn: string
  clockFrom: string
  clockTo: string
  occurrences: number
  headBookingId: string | null
}

export async function seriesFor(id: string): Promise<SeriesRow | undefined> {
  const [row] = await db.select({
    id: schema.roomSeries.id,
    userId: schema.roomSeries.userId,
    roomId: schema.roomSeries.roomId,
    room: schema.rooms.name,
    title: schema.roomSeries.title,
    frequency: schema.roomSeries.frequency,
    weekdays: schema.roomSeries.weekdays,
    startsOn: schema.roomSeries.startsOn,
    clockFrom: schema.roomSeries.clockFrom,
    clockTo: schema.roomSeries.clockTo,
    occurrences: schema.roomSeries.occurrences,
    headBookingId: schema.roomSeries.headBookingId,
  })
    .from(schema.roomSeries)
    .innerJoin(schema.rooms, eq(schema.rooms.id, schema.roomSeries.roomId))
    .where(eq(schema.roomSeries.id, id))
    .limit(1)

  return row
}

// The head is the earliest occurrence still standing, of either kind, resolved by the statement
// rather than by the caller. Batched with the cancel that moved it, so they cannot interleave.
export function promoteHead(seriesId: string, now: number): ReturnType<typeof db.run> {
  const held = HOLDS_A_SLOT.map(status => sql`${status}`)
  const live = LIVE_EXTERNAL.map(status => sql`${status}`)

  // One subquery per kind, and the earlier of the two wins. Exactly one column ends up set: an
  // occurrence we do not manage is not a booking, and a head naming both would name neither.
  const soonestOurs = sql`
    SELECT starts_at FROM room_bookings
    WHERE series_id = ${seriesId} AND status IN (${sql.join(held, sql`, `)})
    ORDER BY starts_at LIMIT 1
  `
  const soonestTheirs = sql`
    SELECT starts_at FROM external_requests
    WHERE series_id = ${seriesId} AND status IN (${sql.join(live, sql`, `)})
    ORDER BY starts_at LIMIT 1
  `

  return db.run(sql`
    UPDATE room_series SET
      head_booking_id = CASE WHEN (${soonestOurs}) IS NOT NULL
        AND ((${soonestTheirs}) IS NULL OR (${soonestOurs}) <= (${soonestTheirs}))
        THEN (SELECT id FROM room_bookings
              WHERE series_id = ${seriesId} AND status IN (${sql.join(held, sql`, `)})
              ORDER BY starts_at LIMIT 1)
      END,
      head_request_id = CASE WHEN (${soonestTheirs}) IS NOT NULL
        AND ((${soonestOurs}) IS NULL OR (${soonestTheirs}) < (${soonestOurs}))
        THEN (SELECT id FROM external_requests
              WHERE series_id = ${seriesId} AND status IN (${sql.join(live, sql`, `)})
              ORDER BY starts_at LIMIT 1)
      END,
      updated_at = ${now}
    WHERE id = ${seriesId}
  `)
}
