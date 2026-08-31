import { eq, inArray, sql } from 'drizzle-orm'
import { chunked, refusalToDecide } from '#shared/utils/approvals'
import { HOLDS_A_SLOT } from '#shared/utils/bookings'
import type { Conflict } from '#shared/utils/bookings'

// Answering a request (C-109). The clash rule rides the approving write, so an approval that has
// been beaten to the slot returns a conflict rather than confirming a double booking (criterion 3).

export interface PendingRow {
  id: string
  roomId: string
  room: string
  userId: string
  requester: string
  title: string
  attendees: number | null
  startsAt: number
  endsAt: number
  tier: string
  status: string
  reason: string | null
  createdAt: number
  escalatedAt: number | null
}

export type DecisionOutcome
  = | { id: string, ok: true, status: 'CONFIRMED' | 'REJECTED' }
    | { id: string, ok: false, why: 'missing' | 'settled' | 'gone' | 'conflict', says: string, conflicts?: Conflict[] }

// Read back the rows a batch names, split so no statement's parameter count grows with the batch
// (0003). Ids come from the body rather than a result set, and the cap is the same either way.
export async function pendingByIds(ids: string[]): Promise<PendingRow[]> {
  const rows: PendingRow[] = []
  for (const batch of chunked(ids)) rows.push(...await selectPending(inArray(schema.roomBookings.id, batch)))
  return rows
}

async function selectPending(where: ReturnType<typeof eq>): Promise<PendingRow[]> {
  return db.select({
    id: schema.roomBookings.id,
    roomId: schema.roomBookings.roomId,
    room: schema.rooms.name,
    userId: schema.roomBookings.userId,
    requester: schema.users.name,
    title: schema.roomBookings.title,
    attendees: schema.roomBookings.attendees,
    startsAt: schema.roomBookings.startsAt,
    endsAt: schema.roomBookings.endsAt,
    tier: schema.roomBookings.tier,
    status: schema.roomBookings.status,
    reason: schema.roomBookings.reason,
    createdAt: schema.roomBookings.createdAt,
    escalatedAt: schema.roomBookings.escalatedAt,
  })
    .from(schema.roomBookings)
    .innerJoin(schema.rooms, eq(schema.rooms.id, schema.roomBookings.roomId))
    .innerJoin(schema.users, eq(schema.users.id, schema.roomBookings.userId))
    .where(where)
}

// The whole predicate is on the statement: still waiting, room still bookable, and nothing
// overlapping it in the room it is going into. A read then a write could be interleaved (0006).
export async function approveOne(id: string, actorId: string, intoRoom: string | null, now: number): Promise<DecisionOutcome> {
  const held = HOLDS_A_SLOT.map(status => sql`${status}`)

  const confirmed = await db.all<{ id: string }>(sql`
    UPDATE room_bookings AS target
    SET status = 'CONFIRMED',
        room_id = COALESCE(${intoRoom}, target.room_id),
        decided_by = ${actorId},
        decided_at = ${now},
        updated_at = ${now}
    WHERE target.id = ${id}
      AND target.status = 'PENDING_APPROVAL'
      AND EXISTS (SELECT 1 FROM rooms WHERE id = COALESCE(${intoRoom}, target.room_id) AND is_active = 1)
      AND NOT EXISTS (
        SELECT 1 FROM room_bookings AS other
        WHERE other.room_id = COALESCE(${intoRoom}, target.room_id)
          AND other.id <> target.id
          AND other.status IN (${sql.join(held, sql`, `)})
          AND other.starts_at < target.ends_at
          AND other.ends_at > target.starts_at
      )
    RETURNING id
  `)

  // The alias is not usable in RETURNING, which is why the column is bare (SQLite).
  if (confirmed.length > 0) return { id, ok: true, status: 'CONFIRMED' }
  return whyItFailed(id, intoRoom)
}

export async function rejectOne(id: string, actorId: string, reason: string, now: number): Promise<DecisionOutcome> {
  const rejected = await db.all<{ id: string }>(sql`
    UPDATE room_bookings AS target
    SET status = 'REJECTED',
        rejection_reason = ${reason},
        decided_by = ${actorId},
        decided_at = ${now},
        updated_at = ${now}
    WHERE target.id = ${id} AND target.status = 'PENDING_APPROVAL'
    RETURNING id
  `)

  if (rejected.length > 0) return { id, ok: true, status: 'REJECTED' }
  return whyItFailed(id, null)
}

// Nothing written, disambiguated rather than guessed: gone, already answered, or beaten to it.
async function whyItFailed(id: string, intoRoom: string | null): Promise<DecisionOutcome> {
  const [row] = await selectPending(eq(schema.roomBookings.id, id))
  if (!row) return { id, ok: false, why: 'missing', says: 'That request is no longer there' }

  const settled = refusalToDecide(row)
  if (settled) return { id, ok: false, why: 'settled', says: settled }

  const roomId = intoRoom ?? row.roomId
  const [room] = await db.select({ id: schema.rooms.id })
    .from(schema.rooms)
    .where(eq(schema.rooms.id, roomId))
    .limit(1)

  if (!room) return { id, ok: false, why: 'gone', says: 'That room is no longer bookable' }

  return {
    id,
    ok: false,
    why: 'conflict',
    says: 'Somebody took that slot while this was waiting',
    conflicts: await conflictsWith({ roomId, startsAt: row.startsAt, endsAt: row.endsAt, exceptId: id }),
  }
}
