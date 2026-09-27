import { sql } from 'drizzle-orm'
import { roomOpenTerms } from './performance-closures'
import { CANCELLABLE, HOLDS_A_SLOT } from '#shared/utils/bookings'
import { LIVE_EXTERNAL } from '#shared/utils/external-requests'
import type { AuditRow } from '#shared/utils/audit'
import type { Alternative } from '#shared/utils/tiers'
import type { ShiftOffsets } from '#shared/utils/rota-times'
import type { Occurrence } from '#shared/utils/series'
import type { SQL } from 'drizzle-orm'

// The bump's and the series' guarded statements, built apart from their runs so a test can race
// them on a real schema. Named imports, because `tests/` typechecks this file under Bun.

function clearOf(roomId: string, startsAt: number, endsAt: number, exceptId?: string): SQL {
  const held = HOLDS_A_SLOT.map(status => sql`${status}`)
  return sql`NOT EXISTS (
    SELECT 1 FROM room_bookings
    WHERE room_id = ${roomId}
      AND status IN (${sql.join(held, sql`, `)})
      AND starts_at < ${endsAt}
      AND ends_at > ${startsAt}
      ${exceptId === undefined ? sql`` : sql`AND id <> ${exceptId}`}
  )`
}

const detailOf = (entry: AuditRow): string => JSON.stringify(entry.detail ?? {})

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

// The claimant's booking first, then the offer and the bump only if it landed: never BUMPED with
// nobody in the slot, and a closure on the slot stops the lot (C-115, 0003).
export function bumpStatements(write: BumpWrite, claimId: string, offerId: string | null, entry: AuditRow): SQL[] {
  const { displaced } = write
  const claimed = sql`EXISTS (SELECT 1 FROM room_bookings WHERE id = ${claimId})`
  const statements = [
    // Guarded on CONFIRMED: a booking cancelled a moment ago is not there to be bumped.
    sql`
      INSERT INTO room_bookings (id, room_id, user_id, title, attendees, starts_at, ends_at, tier, purpose, status)
      SELECT ${claimId}, ${displaced.roomId}, ${write.claimantId}, ${write.title},
             ${displaced.attendees}, ${displaced.startsAt}, ${displaced.endsAt},
             ${write.tier}, ${write.purpose}, 'CONFIRMED'
      WHERE EXISTS (SELECT 1 FROM room_bookings WHERE id = ${displaced.id} AND status = 'CONFIRMED')
        AND ${clearOf(displaced.roomId, displaced.startsAt, displaced.endsAt, displaced.id)}
        AND ${roomOpenTerms(displaced.roomId, displaced.startsAt, displaced.endsAt, write.offsets)}
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
      WHERE ${claimed}
        AND ${clearOf(write.offer.roomId, write.offer.startsAt, write.offer.endsAt)}
        AND ${roomOpenTerms(write.offer.roomId, write.offer.startsAt, write.offer.endsAt, write.offsets)}
    `)
  }

  statements.push(
    // Points only at an offer that was written: one taken or closed since it was found is not.
    sql`
      UPDATE room_bookings
      SET status = 'BUMPED', bumped_reason = ${write.reason},
          bumped_to_booking_id = (SELECT id FROM room_bookings WHERE id = ${offerId}),
          updated_at = ${write.now}
      WHERE id = ${displaced.id} AND status = 'CONFIRMED' AND ${claimed}
    `,
    // Written only if the bump just applied, naming what replaced it and what it offered (0049).
    sql`
      INSERT INTO audit_log (id, actor_id, action, target, detail)
      SELECT ${entry.id}, ${entry.actorId}, ${entry.action}, ${entry.target},
             json_set(${detailOf(entry)}, '$.replacedBy', ${claimId},
                      '$.offered', (SELECT bumped_to_booking_id FROM room_bookings WHERE id = ${displaced.id}))
      WHERE changes() = 1
    `,
  )
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

// Last in the series' batch, after its completeness assertion, so the two stand or fall together
// (0035, 0049).
export function seriesAuditStatement(seriesId: string, entry: AuditRow): SQL {
  return sql`
    INSERT INTO audit_log (id, actor_id, action, target, detail)
    SELECT ${entry.id}, ${entry.actorId}, ${entry.action}, ${entry.target}, ${detailOf(entry)}
    WHERE EXISTS (SELECT 1 FROM room_series WHERE id = ${seriesId})
  `
}

// A term's cancel changes any number of rows in two tables, so its one audit row counts them
// first, in the same batch and under the same predicates as the cancels after it (0049, C-111).
export function seriesCancelStatements(seriesId: string, userId: string, now: number, entry: AuditRow): { audit: SQL, ours: SQL, theirs: SQL } {
  const cancellable = CANCELLABLE.map(status => sql`${status}`)
  const live = LIVE_EXTERNAL.map(status => sql`${status}`)
  const ours = sql`series_id = ${seriesId} AND user_id = ${userId} AND status IN (${sql.join(cancellable, sql`, `)})`
  const theirs = sql`series_id = ${seriesId} AND user_id = ${userId} AND status IN (${sql.join(live, sql`, `)})`

  return {
    audit: sql`
      INSERT INTO audit_log (id, actor_id, action, target, detail)
      SELECT ${entry.id}, ${entry.actorId}, ${entry.action}, ${entry.target},
             json_set(${detailOf(entry)}, '$.cancelled', ours.n + theirs.n)
      FROM (SELECT count(*) AS n FROM room_bookings WHERE ${ours}) AS ours,
           (SELECT count(*) AS n FROM external_requests WHERE ${theirs}) AS theirs
      WHERE ours.n + theirs.n > 0
    `,
    ours: sql`UPDATE room_bookings SET status = 'CANCELLED', updated_at = ${now} WHERE ${ours} RETURNING id, starts_at AS startsAt`,
    theirs: sql`UPDATE external_requests SET status = 'CANCELLED', updated_at = ${now} WHERE ${theirs} RETURNING id, starts_at AS startsAt`,
  }
}
