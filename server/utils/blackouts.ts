import { and, asc, eq, gte, lt, or, sql } from 'drizzle-orm'
import { CANCELLABLE } from '#shared/utils/bookings'
import { formatLondon } from '#shared/utils/london'
import type { Blackout } from '#shared/utils/blackouts'
import type { H3Event } from 'h3'

// Reading and applying blackouts (C-114). A closed room refuses a booking with its reason
// attached, and closing one over existing bookings cancels each of them and says why.

// Every blackout touching a span, for one room or for all of them. Read once for a whole series
// rather than once per occurrence.
export async function blackoutsAcross(from: number, to: number, roomId?: string): Promise<Blackout[]> {
  return db.select({
    id: schema.roomBlackouts.id,
    roomId: schema.roomBlackouts.roomId,
    reason: schema.roomBlackouts.reason,
    startsAt: schema.roomBlackouts.startsAt,
    endsAt: schema.roomBlackouts.endsAt,
  })
    .from(schema.roomBlackouts)
    .where(and(
      lt(schema.roomBlackouts.startsAt, to),
      gte(schema.roomBlackouts.endsAt, from),
      // A blackout with no room covers every room, so it is never filtered out by one.
      roomId ? or(eq(schema.roomBlackouts.roomId, roomId), sql`${schema.roomBlackouts.roomId} IS NULL`) : undefined,
    ))
    .orderBy(asc(schema.roomBlackouts.startsAt))
}

export interface Stranded {
  id: string
  userId: string
  room: string
  title: string
  startsAt: number
  seriesId: string | null
}

// What a new blackout would cancel. Read before writing so the answer can say how many, and read
// again by the write itself so nothing booked in between is missed.
export async function bookingsUnder(blackout: { roomId: string | null, startsAt: number, endsAt: number }): Promise<Stranded[]> {
  return db.select({
    id: schema.roomBookings.id,
    userId: schema.roomBookings.userId,
    room: schema.rooms.name,
    title: schema.roomBookings.title,
    startsAt: schema.roomBookings.startsAt,
    seriesId: schema.roomBookings.seriesId,
  })
    .from(schema.roomBookings)
    .innerJoin(schema.rooms, eq(schema.rooms.id, schema.roomBookings.roomId))
    .where(and(
      blackout.roomId ? eq(schema.roomBookings.roomId, blackout.roomId) : undefined,
      sql`${schema.roomBookings.status} IN ('CONFIRMED', 'PENDING_APPROVAL')`,
      sql`${schema.roomBookings.startsAt} < ${blackout.endsAt}`,
      sql`${schema.roomBookings.endsAt} > ${blackout.startsAt}`,
    ))
    .orderBy(asc(schema.roomBookings.startsAt))
}

// Only the occurrences a blackout actually covers, never a whole series: a get-in on one Monday
// does not cancel a term (criterion 3).
export function cancelStranded(blackout: { id: string, roomId: string | null, startsAt: number, endsAt: number }, now: number): ReturnType<typeof db.run> {
  const held = CANCELLABLE.map(status => sql`${status}`)
  const room = blackout.roomId
    ? sql`AND room_id = ${blackout.roomId}`
    : sql``

  return db.run(sql`
    UPDATE room_bookings
    SET status = 'CANCELLED',
        rejection_reason = (SELECT 'The room is closed then: ' || reason FROM room_blackouts WHERE id = ${blackout.id}),
        updated_at = ${now}
    WHERE status IN (${sql.join(held, sql`, `)})
      ${room}
      AND starts_at < ${blackout.endsAt}
      AND ends_at > ${blackout.startsAt}
  `)
}

// One message per member however many of their bookings a blackout took, naming each (C-113).
export async function tellStranded(event: H3Event | undefined, stranded: Stranded[], reason: string): Promise<number> {
  const byMember = new Map<string, Stranded[]>()
  for (const booking of stranded) byMember.set(booking.userId, [...(byMember.get(booking.userId) ?? []), booking])

  const base = useRuntimeConfig(event).public.baseURL
  for (const [userId, theirs] of byMember) {
    await notify(event, {
      type: 'room.blackout.cancelled',
      userId,
      context: {
        name: '',
        reason,
        bookings: theirs.map(booking => ({
          room: booking.room,
          title: booking.title,
          when: formatLondon(new Date(booking.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' }),
        })),
        roomsUrl: `${base}/rooms`,
      },
    })
  }

  return byMember.size
}

// The head of every series a blackout touched follows what is left of it (C-111 criterion 3).
export async function repointSeries(stranded: Stranded[], now: number): Promise<void> {
  const series = [...new Set(stranded.map(booking => booking.seriesId).filter(id => id !== null))]
  for (const id of series) await promoteHead(id, now)
}

// The blackouts a screen shows, newest span first, with who closed the room.
export async function listBlackouts(since: number): Promise<(Blackout & { room: string | null, by: string | null, createdAt: number })[]> {
  return db.select({
    id: schema.roomBlackouts.id,
    roomId: schema.roomBlackouts.roomId,
    room: schema.rooms.name,
    reason: schema.roomBlackouts.reason,
    startsAt: schema.roomBlackouts.startsAt,
    endsAt: schema.roomBlackouts.endsAt,
    by: schema.users.name,
    createdAt: schema.roomBlackouts.createdAt,
  })
    .from(schema.roomBlackouts)
    .leftJoin(schema.rooms, eq(schema.rooms.id, schema.roomBlackouts.roomId))
    .leftJoin(schema.users, eq(schema.users.id, schema.roomBlackouts.createdBy))
    .where(gte(schema.roomBlackouts.endsAt, since))
    .orderBy(asc(schema.roomBlackouts.startsAt))
}
