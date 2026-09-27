import { sql } from 'drizzle-orm'
import { roomOpenTerms } from './performance-closures'
import { HOLDS_A_SLOT } from '#shared/utils/bookings'
import type { Alternative } from '#shared/utils/tiers'
import type { ShiftOffsets } from '#shared/utils/rota-times'
import type { Occurrence } from '#shared/utils/series'
import type { SQL } from 'drizzle-orm'

// The bump's and the series' guarded statements, built apart from their runs so a test can race
// them on a real schema. Named imports, because `tests/` typechecks this file under Bun.

function clearOf(roomId: string, startsAt: number, endsAt: number): SQL {
  const held = HOLDS_A_SLOT.map(status => sql`${status}`)
  return sql`NOT EXISTS (
    SELECT 1 FROM room_bookings
    WHERE room_id = ${roomId}
      AND status IN (${sql.join(held, sql`, `)})
      AND starts_at < ${endsAt}
      AND ends_at > ${startsAt}
  )`
}

export interface BumpWrite {
  displaced: { id: string, roomId: string, userId: string, title: string, attendees: number | null, startsAt: number, endsAt: number, tier: string, purpose: string | null }
  claimantId: string
  title: string
  tier: string
  purpose: string
  reason: string
  offer: Alternative | undefined
  now: number
  offsets: ShiftOffsets
}

// The displaced booking is bumped only while its slot is open, so a closure made since the route's
// check leaves it standing and hands nobody the slot (C-115, 0003). The offer is held the same way.
export function bumpStatements(write: BumpWrite, claimId: string, offerId: string | null): SQL[] {
  const { displaced } = write
  const statements = [
    // Guarded on CONFIRMED: a booking cancelled a moment ago is not there to be bumped.
    sql`
      UPDATE room_bookings
      SET status = 'BUMPED', bumped_reason = ${write.reason}, bumped_to_booking_id = ${offerId},
          updated_at = ${write.now}
      WHERE id = ${displaced.id} AND status = 'CONFIRMED'
        AND ${roomOpenTerms(displaced.roomId, displaced.startsAt, displaced.endsAt, write.offsets)}
    `,
    // Written only if the bump landed, so a lost race leaves no booking behind.
    sql`
      INSERT INTO room_bookings (id, room_id, user_id, title, attendees, starts_at, ends_at, tier, purpose, status)
      SELECT ${claimId}, ${displaced.roomId}, ${write.claimantId}, ${write.title},
             ${displaced.attendees}, ${displaced.startsAt}, ${displaced.endsAt},
             ${write.tier}, ${write.purpose}, 'CONFIRMED'
      WHERE EXISTS (SELECT 1 FROM room_bookings WHERE id = ${displaced.id} AND status = 'BUMPED')
        AND ${clearOf(displaced.roomId, displaced.startsAt, displaced.endsAt)}
    `,
  ]

  // The replacement is held for them rather than merely suggested: an offer somebody else can
  // book while the member reads their email is not an offer (criterion 3).
  if (write.offer && offerId) {
    statements.push(sql`
      INSERT INTO room_bookings (id, room_id, user_id, title, attendees, starts_at, ends_at, tier, purpose, status, notes)
      SELECT ${offerId}, ${write.offer.roomId}, ${displaced.userId}, ${displaced.title},
             ${displaced.attendees}, ${write.offer.startsAt}, ${write.offer.endsAt},
             ${displaced.tier}, ${displaced.purpose}, 'CONFIRMED', 'Offered in place of a bumped booking'
      WHERE EXISTS (SELECT 1 FROM room_bookings WHERE id = ${displaced.id} AND status = 'BUMPED')
        AND ${clearOf(write.offer.roomId, write.offer.startsAt, write.offer.endsAt)}
        AND ${roomOpenTerms(write.offer.roomId, write.offer.startsAt, write.offer.endsAt, write.offsets)}
    `)
    // An offer taken or closed since it was found is not written, and nothing may point at it.
    statements.push(sql`
      UPDATE room_bookings SET bumped_to_booking_id = NULL
      WHERE id = ${displaced.id} AND bumped_to_booking_id = ${offerId}
        AND NOT EXISTS (SELECT 1 FROM room_bookings WHERE id = ${offerId})
    `)
  }
  return statements
}

export interface SeriesClaim {
  seriesId: string
  userId: string
  roomId: string
  title: string
  attendees: number | null
  tier: string
  purpose: string
  notes: string | null
  status: 'CONFIRMED' | 'PENDING_APPROVAL'
  offsets: ShiftOffsets
}

// One occurrence claimed under its own clash and closure predicates; the series' completeness
// assertion then fails the whole batch if any occurrence wrote nothing (0035, 0003).
export function seriesClaimStatement(id: string, write: SeriesClaim, one: Occurrence): SQL {
  const startsAt = Math.floor(one.startsAt.getTime() / 1000)
  const endsAt = Math.floor(one.endsAt.getTime() / 1000)
  return sql`
    INSERT INTO room_bookings
      (id, room_id, user_id, title, attendees, starts_at, ends_at, tier, purpose, status, notes, series_id, occurrence)
    SELECT ${id}, ${write.roomId}, ${write.userId}, ${write.title}, ${write.attendees},
           ${startsAt}, ${endsAt}, ${write.tier}, ${write.purpose}, ${write.status}, ${write.notes},
           ${write.seriesId}, ${one.occurrence}
    WHERE EXISTS (SELECT 1 FROM rooms WHERE id = ${write.roomId} AND is_active = 1)
      AND ${clearOf(write.roomId, startsAt, endsAt)}
      AND ${roomOpenTerms(write.roomId, startsAt, endsAt, write.offsets)}
  `
}
