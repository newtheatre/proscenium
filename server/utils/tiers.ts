import { and, asc, eq, gte, ne, sql } from 'drizzle-orm'
import { HOLDS_A_SLOT } from '#shared/utils/bookings'
import { nearest } from '#shared/utils/tiers'
import { blackoutsAcross } from './blackouts'
import { blackoutOver } from '#shared/utils/blackouts'
import type { Alternative } from '#shared/utils/tiers'
import type { H3Event } from 'h3'

// Bumping (C-115). Never automatic: an officer does it, with a reason, and the displaced member
// is offered the nearest equivalent slot rather than simply losing the room.

export interface Displaced {
  id: string
  roomId: string
  room: string
  userId: string
  who: string
  title: string
  attendees: number | null
  startsAt: number
  endsAt: number
  status: string
  tier: string
  capacity: number | null
}

export async function displacedBooking(id: string): Promise<Displaced | undefined> {
  const [row] = await db.select({
    id: schema.roomBookings.id,
    roomId: schema.roomBookings.roomId,
    room: schema.rooms.name,
    userId: schema.roomBookings.userId,
    who: schema.users.name,
    title: schema.roomBookings.title,
    attendees: schema.roomBookings.attendees,
    startsAt: schema.roomBookings.startsAt,
    endsAt: schema.roomBookings.endsAt,
    status: schema.roomBookings.status,
    tier: schema.roomBookings.tier,
    capacity: schema.rooms.capacity,
  })
    .from(schema.roomBookings)
    .innerJoin(schema.rooms, eq(schema.rooms.id, schema.roomBookings.roomId))
    .innerJoin(schema.users, eq(schema.users.id, schema.roomBookings.userId))
    .where(eq(schema.roomBookings.id, id))
    .limit(1)

  return row
}

// Free slots of the same length, in the same room or one that holds at least as many, within a
// window either side. Bounded by that window rather than by a count, so the search is one read.
export async function alternativesFor(displaced: Displaced, withinDays = 14): Promise<Alternative[]> {
  const length = displaced.endsAt - displaced.startsAt
  const from = displaced.startsAt - withinDays * 86_400
  const to = displaced.endsAt + withinDays * 86_400

  const rooms = await db.select({
    id: schema.rooms.id,
    name: schema.rooms.name,
    capacity: schema.rooms.capacity,
  })
    .from(schema.rooms)
    .where(and(
      eq(schema.rooms.isActive, true),
      eq(schema.rooms.isExternal, false),
      // At least as big, and a room whose capacity nobody recorded cannot be shown to be: a
      // broom cupboard offered in place of the auditorium is worse than offering nothing.
      displaced.capacity === null
        ? undefined
        : sql`(${schema.rooms.capacity} IS NOT NULL AND ${schema.rooms.capacity} >= ${displaced.capacity})`,
    ))

  const taken = await db.select({
    roomId: schema.roomBookings.roomId,
    startsAt: schema.roomBookings.startsAt,
    endsAt: schema.roomBookings.endsAt,
  })
    .from(schema.roomBookings)
    .where(and(
      sql`${schema.roomBookings.status} IN ('CONFIRMED', 'PENDING_APPROVAL')`,
      ne(schema.roomBookings.id, displaced.id),
      gte(schema.roomBookings.endsAt, from),
      sql`${schema.roomBookings.startsAt} < ${to}`,
    ))
    .orderBy(asc(schema.roomBookings.startsAt))

  const shut = await blackoutsAcross(from, to)

  // The same clock time on nearby days, which is what "equivalent" means to somebody rearranging
  // a rehearsal: an hour earlier on the right day beats the same hour three weeks later.
  const candidates: Alternative[] = []
  for (const room of rooms) {
    for (let day = -withinDays; day <= withinDays; day++) {
      if (day === 0 && room.id === displaced.roomId) continue
      const startsAt = displaced.startsAt + day * 86_400
      const endsAt = startsAt + length
      if (endsAt <= Math.floor(Date.now() / 1000)) continue

      const clash = taken.some(one => one.roomId === room.id && one.startsAt < endsAt && one.endsAt > startsAt)
      if (clash) continue
      if (blackoutOver(shut, room.id, { startsAt, endsAt })) continue

      candidates.push({ roomId: room.id, room: room.name, startsAt, endsAt, capacity: room.capacity })
    }
  }

  return candidates
}

export function nearestTo(displaced: Displaced, candidates: Alternative[]): Alternative | undefined {
  return nearest(candidates, displaced.startsAt, displaced.roomId)
}

// The bump itself: the displaced booking becomes BUMPED and the claimant's takes the slot, in one
// batch guarded on the status that was read (criteria 2 and 4).
export async function performBump(input: {
  displaced: Displaced
  claimantId: string
  title: string
  tier: string
  reason: string
  offer: Alternative | undefined
  now: number
}): Promise<{ won: boolean, replacementId: string | null, offeredId: string | null }> {
  const claimId = newId()
  const offerId = input.offer ? newId() : null
  const held = HOLDS_A_SLOT.map(status => sql`${status}`)

  const statements = [
    // Guarded on CONFIRMED: a booking cancelled a moment ago is not there to be bumped.
    db.run(sql`
      UPDATE room_bookings
      SET status = 'BUMPED', bumped_reason = ${input.reason}, bumped_to_booking_id = ${offerId},
          updated_at = ${input.now}
      WHERE id = ${input.displaced.id} AND status = 'CONFIRMED'
    `),
    // Written only if the bump landed, so a lost race leaves no booking behind.
    db.run(sql`
      INSERT INTO room_bookings (id, room_id, user_id, title, attendees, starts_at, ends_at, tier, status)
      SELECT ${claimId}, ${input.displaced.roomId}, ${input.claimantId}, ${input.title},
             ${input.displaced.attendees}, ${input.displaced.startsAt}, ${input.displaced.endsAt},
             ${input.tier}, 'CONFIRMED'
      WHERE EXISTS (SELECT 1 FROM room_bookings WHERE id = ${input.displaced.id} AND status = 'BUMPED')
        AND NOT EXISTS (
          SELECT 1 FROM room_bookings
          WHERE room_id = ${input.displaced.roomId}
            AND status IN (${sql.join(held, sql`, `)})
            AND starts_at < ${input.displaced.endsAt}
            AND ends_at > ${input.displaced.startsAt}
        )
    `),
  ]

  // The replacement is held for them rather than merely suggested: an offer somebody else can
  // book while the member reads their email is not an offer (criterion 3).
  if (input.offer && offerId) {
    statements.push(db.run(sql`
      INSERT INTO room_bookings (id, room_id, user_id, title, attendees, starts_at, ends_at, tier, status, notes)
      SELECT ${offerId}, ${input.offer.roomId}, ${input.displaced.userId}, ${input.displaced.title},
             ${input.displaced.attendees}, ${input.offer.startsAt}, ${input.offer.endsAt},
             ${input.displaced.tier}, 'CONFIRMED', 'Offered in place of a bumped booking'
      WHERE EXISTS (SELECT 1 FROM room_bookings WHERE id = ${input.displaced.id} AND status = 'BUMPED')
        AND NOT EXISTS (
          SELECT 1 FROM room_bookings
          WHERE room_id = ${input.offer.roomId}
            AND status IN (${sql.join(held, sql`, `)})
            AND starts_at < ${input.offer.endsAt}
            AND ends_at > ${input.offer.startsAt}
        )
    `))
  }

  await db.batch(statements as unknown as Parameters<typeof db.batch>[0])

  const [after] = await db.select({ status: schema.roomBookings.status })
    .from(schema.roomBookings)
    .where(eq(schema.roomBookings.id, input.displaced.id))
    .limit(1)

  if (after?.status !== 'BUMPED') return { won: false, replacementId: null, offeredId: null }

  const landed = await db.select({ id: schema.roomBookings.id })
    .from(schema.roomBookings)
    .where(eq(schema.roomBookings.id, claimId))
    .limit(1)

  return {
    won: landed.length > 0,
    replacementId: landed.length > 0 ? claimId : null,
    offeredId: offerId,
  }
}

export async function tierOrder(event: H3Event | undefined): Promise<string[]> {
  return await configValue(event, 'ROOM_PRIORITY_TIERS')
}
