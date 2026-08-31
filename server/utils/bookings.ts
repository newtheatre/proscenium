import { and, eq, inArray, sql } from 'drizzle-orm'
import { HOLDS_A_SLOT } from '#shared/utils/bookings'
import type { BookingStatus, Conflict } from '#shared/utils/bookings'

// The slot claim. One guarded statement, never a read then a check then a write: two requests
// arriving together must not both see the slot free (0003, 0006, C-107 criterion 2).

export interface ClaimInput {
  roomId: string
  userId: string
  title: string
  attendees: number | null
  startsAt: number
  endsAt: number
  tier: string
  status: BookingStatus
  notes: string | null
}

export type ClaimOutcome
  = | { won: true, id: string }
  // Nothing to claim: the room is gone or retired. 410, not 409.
    | { won: false, why: 'gone' }
  // Somebody took it. 409, with what is in the way.
    | { won: false, why: 'conflict', conflicts: Conflict[] }

// The predicate rides the INSERT, so the check and the write are one statement and cannot be
// interleaved. Half-open, so back-to-back bookings both succeed (criterion 5).
export async function claimSlot(input: ClaimInput): Promise<ClaimOutcome> {
  const id = newId()
  const held = HOLDS_A_SLOT.map(status => sql`${status}`)

  // RETURNING rather than a changes count: the driver's meta is not a shape to rely on, and a row
  // coming back is the same signal claimToken uses to know it won (0003).
  const claimed = await db.all<{ id: string }>(sql`
    INSERT INTO room_bookings (id, room_id, user_id, title, attendees, starts_at, ends_at, tier, status, notes)
    SELECT ${id}, ${input.roomId}, ${input.userId}, ${input.title}, ${input.attendees},
           ${input.startsAt}, ${input.endsAt}, ${input.tier}, ${input.status}, ${input.notes}
    WHERE EXISTS (SELECT 1 FROM rooms WHERE id = ${input.roomId} AND is_active = 1)
      AND NOT EXISTS (
        SELECT 1 FROM room_bookings
        WHERE room_id = ${input.roomId}
          AND status IN (${sql.join(held, sql`, `)})
          AND starts_at < ${input.endsAt}
          AND ends_at > ${input.startsAt}
      )
    RETURNING id
  `)

  if (claimed.length > 0) return { won: true, id }

  // Zero rows written, disambiguated rather than guessed: gone versus beaten (0003).
  return await whyItFailed(input)
}

async function whyItFailed(input: ClaimInput): Promise<ClaimOutcome> {
  const [room] = await db.select({ id: schema.rooms.id })
    .from(schema.rooms)
    .where(and(eq(schema.rooms.id, input.roomId), eq(schema.rooms.isActive, true)))
    .limit(1)

  if (!room) return { won: false, why: 'gone' }
  return { won: false, why: 'conflict', conflicts: await conflictsWith(input) }
}

// What is in the way, for the refusal to quote. Masked by the caller, never here: this returns the
// truth and the route decides who may see it (C-103 criterion 4).
export async function conflictsWith(span: { roomId: string, startsAt: number, endsAt: number }): Promise<Conflict[]> {
  const rows = await db.select({
    startsAt: schema.roomBookings.startsAt,
    endsAt: schema.roomBookings.endsAt,
    title: schema.roomBookings.title,
    bookedBy: schema.users.name,
  })
    .from(schema.roomBookings)
    .leftJoin(schema.users, eq(schema.users.id, schema.roomBookings.userId))
    .where(and(
      eq(schema.roomBookings.roomId, span.roomId),
      inArray(schema.roomBookings.status, [...HOLDS_A_SLOT]),
      sql`${schema.roomBookings.startsAt} < ${span.endsAt}`,
      sql`${schema.roomBookings.endsAt} > ${span.startsAt}`,
    ))

  return rows.map(row => ({
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    title: row.title,
    bookedBy: row.bookedBy ?? undefined,
  }))
}

// How many a member already holds, for the cap. Counted in SQL: the number is the answer, and
// fetching the rows to length them would grow with the cap.
export async function activeBookingsFor(userId: string, now: number): Promise<number> {
  const [row] = await db.select({ held: sql<number>`count(*)` })
    .from(schema.roomBookings)
    .where(and(
      eq(schema.roomBookings.userId, userId),
      inArray(schema.roomBookings.status, [...HOLDS_A_SLOT]),
      sql`${schema.roomBookings.endsAt} > ${now}`,
    ))

  return row?.held ?? 0
}
