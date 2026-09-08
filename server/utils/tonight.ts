import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { heldSeatsSubquery } from './capacity'
import { COMMITTED_SHIFT_STATUSES } from '#shared/utils/rota'
import type { ShiftRole, ShiftStatus } from '#shared/utils/rota'
import type { SQL } from 'drizzle-orm'

// The duty manager's tonight screen (E-112). Every query binds a fixed number of parameters per
// performance asked about, bounded by the programme rather than by any table's row count (0003).

export interface TonightHouse {
  sold: number
  admitted: number
  capacity: number | null
  remaining: number | null
}

// "Sold" rides `heldSeatsSubquery`, never a bare row count (D-105 criterion 2). `admitted` is
// `reservations.status = 'DOOR'`, which nothing writes until D-126 builds the door scan.
export function tonightHouseQuery(performanceId: string): SQL {
  return sql`
    SELECT
      ${heldSeatsSubquery(sql`${performanceId}`)} AS sold,
      (SELECT count(*) FROM reservations WHERE performance_id = ${performanceId} AND status = 'DOOR') AS admitted
  `
}

export async function tonightHouse(performanceId: string, capacity: number | null): Promise<TonightHouse> {
  const [row] = await db.all<{ sold: number, admitted: number }>(tonightHouseQuery(performanceId))
  const sold = row?.sold ?? 0
  const admitted = row?.admitted ?? 0
  return { sold, admitted, capacity, remaining: capacity === null ? null : Math.max(0, capacity - sold) }
}

export interface TonightTeamMember {
  shiftId: string
  role: ShiftRole
  status: ShiftStatus
  filled: boolean
  name: string | null
  phone: string | null
}

interface TeamRow {
  shiftId: string
  role: ShiftRole
  status: ShiftStatus
  userId: string | null
  name: string | null
  phone: string | null
  visible: number | null
}

export function tonightTeamQuery(performanceId: string): SQL {
  return sql`
    SELECT s.id AS shiftId, s.role AS role, s.status AS status, s.user_id AS userId,
           u.name AS name, u.phone AS phone, scp.visible AS visible
    FROM shifts s
    LEFT JOIN users u ON u.id = s.user_id
    LEFT JOIN shift_contact_preferences scp ON scp.user_id = s.user_id
    WHERE s.performance_id = ${performanceId} AND s.status <> 'CANCELLED'
    ORDER BY s.role, s.slot
  `
}

// An unfilled slot never shows a blank name: OPEN, DECLINED and an unconfirmed claim all read as
// unfilled (E-112 criterion 2). The phone shows only where consent is currently set, read fresh.
export function readTeamRow(row: TeamRow): TonightTeamMember {
  const filled = (COMMITTED_SHIFT_STATUSES as readonly string[]).includes(row.status)
  return {
    shiftId: row.shiftId,
    role: row.role,
    status: row.status,
    filled,
    name: filled ? row.name : null,
    phone: filled && row.visible ? row.phone : null,
  }
}

export async function tonightTeam(performanceId: string): Promise<TonightTeamMember[]> {
  const rows = await db.all<TeamRow>(tonightTeamQuery(performanceId))
  return rows.map(readTeamRow)
}

export interface TonightPerformance {
  performanceId: string
  showId: string
  showTitle: string
  venueName: string
  startsAt: number
  doorsAt: number | null
  durationMinutes: number | null
  intervalCount: number
  intervalMinutes: number | null
  latecomerPolicy: string | null
  ageGuidance: string | null
  capacityOverride: number | null
  venueCapacity: number | null
}

// Bound at the performance's own id, one row per call: `performanceIds` never grows with a
// table's size, only with how many performances one venue runs one night (E-127 criterion 1).
export function tonightPerformanceQuery(performanceId: string): SQL {
  return sql`
    SELECT p.id AS performanceId, sh.id AS showId, sh.title AS showTitle, v.name AS venueName,
           p.starts_at AS startsAt, p.doors_at AS doorsAt, p.duration_minutes AS durationMinutes,
           p.interval_count AS intervalCount, p.interval_minutes AS intervalMinutes,
           sh.latecomer_policy AS latecomerPolicy, sh.age_guidance AS ageGuidance,
           p.capacity_override AS capacityOverride, v.capacity AS venueCapacity
    FROM performances p
    JOIN shows sh ON sh.id = p.show_id
    JOIN venues v ON v.id = p.venue_id
    WHERE p.id = ${performanceId}
  `
}

export async function tonightPerformance(performanceId: string): Promise<TonightPerformance | undefined> {
  const [row] = await db.all<TonightPerformance>(tonightPerformanceQuery(performanceId))
  return row
}
