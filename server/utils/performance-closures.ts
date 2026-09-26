import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { shiftOffsetDefaults } from './rota'
import { HOLDS_A_SLOT, overlaps } from '#shared/utils/bookings'
import { performanceClosure } from '#shared/utils/performance-closures'
import type { PerformanceClosure, PerformanceOnStage } from '#shared/utils/performance-closures'
import type { SQL } from 'drizzle-orm'
import type { H3Event } from 'h3'

// The rooms a performance closes, read when a booking or the calendar is (0043, issue 1347).
// Named imports rather than Nitro's, because `tests/` typechecks this file under Bun.

// A day either side is wider than any window a house records around its curtain; the exact
// overlap is `shiftWindow()`'s, tested after the read (0078).
const PAD_SECONDS = 86_400

export interface PerformanceOnRoom extends PerformanceOnStage {
  roomName: string
  venueName: string
}

// Binds the span and at most one room, however full the programme is (0006).
export function performancesOnRoomsQuery(from: number, to: number, roomId?: string): SQL {
  const room = roomId === undefined ? sql`v.room_id IS NOT NULL` : sql`v.room_id = ${roomId}`
  return sql`
    SELECT p.id AS performanceId, v.room_id AS roomId, r.name AS roomName, v.name AS venueName,
           s.title AS showTitle, p.starts_at AS startsAt, p.doors_at AS doorsAt,
           p.duration_minutes AS durationMinutes, p.interval_count AS intervalCount,
           p.interval_minutes AS intervalMinutes
    FROM performances p
    JOIN venues v ON v.id = p.venue_id
    JOIN rooms r ON r.id = v.room_id
    JOIN shows s ON s.id = p.show_id
    WHERE ${room} AND p.status <> 'CANCELLED'
      AND p.starts_at > ${from - PAD_SECONDS} AND p.starts_at < ${to + PAD_SECONDS}
    ORDER BY p.starts_at
  `
}

interface Closed { closure: PerformanceClosure, performance: PerformanceOnRoom }

// The same edges an officer's closure is read with, so the two kinds refuse alike.
async function performancesAcross(event: H3Event | undefined, from: number, to: number, roomId?: string): Promise<Closed[]> {
  const [rows, offsets] = await Promise.all([
    db.all<PerformanceOnRoom>(performancesOnRoomsQuery(from, to, roomId)),
    shiftOffsetDefaults(event),
  ])
  return rows
    .map(row => ({ closure: performanceClosure(row, offsets), performance: row }))
    .filter(({ closure }) => closure.startsAt < to && closure.endsAt >= from)
}

export async function performanceClosuresAcross(event: H3Event | undefined, from: number, to: number, roomId?: string): Promise<PerformanceClosure[]> {
  return (await performancesAcross(event, from, to, roomId)).map(({ closure }) => closure)
}

export interface Overlapping {
  id: string
  title: string
  status: string
  startsAt: number
  endsAt: number
  bookedBy: string | null
}

export interface ListedPerformanceClosure extends PerformanceClosure {
  room: string
  venue: string
  overlapping: Overlapping[]
}

// For the Theatre Manager to settle by hand: a booking made before its room was attached, or
// before the performance was scheduled, is left standing rather than cancelled (issue 1347).
export async function performanceClosuresListed(event: H3Event | undefined, from: number, to: number): Promise<ListedPerformanceClosure[]> {
  const closures = await performancesAcross(event, from, to)
  if (closures.length === 0) return []

  const held = HOLDS_A_SLOT.map(status => sql`${status}`)
  const bookings = await db.all<Overlapping & { roomId: string }>(sql`
    SELECT b.id AS id, b.room_id AS roomId, b.title AS title, b.status AS status,
           b.starts_at AS startsAt, b.ends_at AS endsAt, u.name AS bookedBy
    FROM room_bookings b
    LEFT JOIN users u ON u.id = b.user_id
    WHERE b.status IN (${sql.join(held, sql`, `)})
      AND b.room_id IN (SELECT room_id FROM venues WHERE room_id IS NOT NULL)
      AND b.starts_at < ${to + PAD_SECONDS} AND b.ends_at > ${from - PAD_SECONDS}
    ORDER BY b.starts_at
  `)

  return closures.map(({ closure, performance }) => ({
    ...closure,
    room: performance.roomName,
    venue: performance.venueName,
    overlapping: bookings
      .filter(booking => booking.roomId === closure.roomId && overlaps(booking, closure))
      .map(booking => ({
        id: booking.id,
        title: booking.title,
        status: booking.status,
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
        bookedBy: booking.bookedBy,
      })),
  }))
}
