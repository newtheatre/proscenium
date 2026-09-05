import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
// Named rather than taken from Nitro's auto-imports, because `tests/` typechecks this file under
// Bun, where nothing is auto-imported (CONTRIBUTING).
import { createError } from 'h3'
import { shiftConstraintRefusal } from '#shared/utils/rota'
import type { ShiftRole, ShiftStatus, TemplateSlot } from '#shared/utils/rota'
import type { SQL } from 'drizzle-orm'

// Reading and writing the rota (E-101, E-102, E-106). Every statement here binds a fixed number
// of parameters however many performances or slots it covers (0003, 0006).

export interface VenueTemplate {
  venueId: string
  venueName: string
  slots: TemplateSlot[]
}

// `role` is null for a venue with no template, which is what the LEFT JOIN is for.
interface TemplateRow { venueId: string, venueName: string, role: ShiftRole | null, count: number }

// Every venue, with the slots its template holds. A venue with no template is here with an empty
// list, because "this venue stamps nothing" is the thing the screen has to show (E-101).
export async function listVenueTemplates(): Promise<VenueTemplate[]> {
  const rows = await db.all<TemplateRow>(sql`
    SELECT v.id AS venueId, v.name AS venueName, t.role AS role, t."count" AS "count"
    FROM venues v
    LEFT JOIN shift_templates t ON t.venue_id = v.id
    ORDER BY v.name COLLATE NOCASE, t.role
  `)

  const templates = new Map<string, VenueTemplate>()
  for (const row of rows) {
    const held = templates.get(row.venueId) ?? { venueId: row.venueId, venueName: row.venueName, slots: [] }
    if (row.role !== null) held.slots.push({ role: row.role, count: row.count })
    templates.set(row.venueId, held)
  }
  return [...templates.values()]
}

export async function templateSlotsFor(venueId: string): Promise<TemplateSlot[]> {
  return await db.all<TemplateSlot>(sql`
    SELECT role, "count" FROM shift_templates WHERE venue_id = ${venueId} ORDER BY role
  `)
}

// A template is replaced whole: the slots are one thing an officer edits, and a partial save
// would leave a venue with a role it had already taken off the list.
export function replaceTemplateStatements(venueId: string, slots: TemplateSlot[], actorId: string): [SQL, ...SQL[]] {
  const written = slots.map(slot => sql`
    INSERT INTO shift_templates (id, venue_id, role, "count", updated_by, updated_at)
    VALUES (lower(hex(randomblob(16))), ${venueId}, ${slot.role}, ${slot.count}, ${actorId}, unixepoch())
  `)
  return [sql`DELETE FROM shift_templates WHERE venue_id = ${venueId}`, ...written]
}

// Stamping. The slot ordinals come out of a recursive count rather than out of the request, so
// the statement binds only what `scope` binds however many slots a template holds (0006).
function stampStatement(scope: SQL): SQL {
  return sql`
    WITH RECURSIVE slot(i) AS (
      SELECT 1
      UNION ALL
      SELECT i + 1 FROM slot WHERE i < (SELECT coalesce(max("count"), 0) FROM shift_templates)
    )
    INSERT INTO shifts (id, performance_id, role, slot, status)
    SELECT lower(hex(randomblob(16))), p.id, t.role, slot.i, 'OPEN'
    FROM performances p
    JOIN shift_templates t ON t.venue_id = p.venue_id
    JOIN slot ON slot.i <= t."count"
    WHERE p.status <> 'CANCELLED' AND (${scope})
    ON CONFLICT DO NOTHING
    RETURNING id
  `
}

// One performance, for the batch that creates it: the performance row is inserted first in the
// same batch, so this reads it (E-102 criterion 1).
export function stampPerformanceStatement(performanceId: string): SQL {
  return stampStatement(sql`p.id = ${performanceId}`)
}

// The backfill: every performance at a venue whose night has not started yet. Running it twice
// stamps nothing the second time, held by the uniqueness rule (E-102 criterion 2).
export function backfillVenueStatement(venueId: string, from: number): SQL {
  return stampStatement(sql`p.venue_id = ${venueId} AND p.starts_at >= ${from}`)
}

// A cancelled performance is not a night's work, so its shifts are cancelled with it. Whoever
// held one keeps their name on it; an open one had nobody (E-102 criterion 4).
export function cancelShiftsStatement(performanceId: string): SQL {
  return sql`
    UPDATE shifts SET status = 'CANCELLED'
    WHERE performance_id = ${performanceId} AND status <> 'CANCELLED'
  `
}

// An open shift belongs to the house it was stamped from, so moving a performance to another
// venue clears them. A held one names somebody who committed to this performance (E-107).
export function clearOpenShiftsStatement(performanceId: string): SQL {
  return sql`DELETE FROM shifts WHERE performance_id = ${performanceId} AND status = 'OPEN'`
}

// Claimed or confirmed: somebody has put their name to this performance, so it is cancelled and
// they are told, never deleted from under them (D-121 criterion 5, E-102 criterion 4).
export async function heldShiftCount(performanceId: string): Promise<number> {
  const [row] = await db.all<{ n: number }>(sql`
    SELECT count(*) AS n FROM shifts
    WHERE performance_id = ${performanceId} AND status IN ('CLAIMED', 'CONFIRMED')
  `)
  return row?.n ?? 0
}

export interface RotaShift { shiftId: string, userId: string | null, role: ShiftRole, status: ShiftStatus }

// Everything a cancellation or a move has to reckon with: an open slot has nobody to tell, a
// claimed or confirmed one does, whatever stage it is at (E-102 criterion 4).
export async function activeShifts(performanceId: string): Promise<RotaShift[]> {
  return await db.all<RotaShift>(sql`
    SELECT id AS shiftId, user_id AS userId, role, status
    FROM shifts
    WHERE performance_id = ${performanceId} AND status <> 'CANCELLED'
    ORDER BY role, slot
  `)
}

// A held shift whose role the new venue's template does not staff at all: kept only by accident
// otherwise, so a move takes it too rather than stranding it at a house that never asks for it.
export function cancelOrphanedShiftsStatement(performanceId: string, newVenueId: string): SQL {
  return sql`
    UPDATE shifts SET status = 'CANCELLED'
    WHERE performance_id = ${performanceId}
      AND status IN ('CLAIMED', 'CONFIRMED')
      AND role NOT IN (SELECT role FROM shift_templates WHERE venue_id = ${newVenueId})
  `
}

// A raw constraint failure is never what a caller reads back; anything unrecognised is rethrown,
// because swallowing it would turn a defect into a 409 nobody investigates (E-106 criterion 3).
export async function withShiftConstraints<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write()
  }
  catch (error) {
    const refusal = shiftConstraintRefusal(error)
    if (!refusal) throw error
    throw createError(refusal)
  }
}

// The open-shift list (E-103). Two bound parameters at most beyond the filters themselves,
// whatever the page holds: nothing here binds per shift or per performance (0003, 0006).
const where = (terms: SQL[]): SQL => (terms.length ? sql` WHERE ${sql.join(terms, sql` AND `)}` : sql``)

export interface OpenShiftFilters {
  role?: ShiftRole
  // Inclusive unix-second bounds. Absent means no further narrowing beyond `now`.
  from?: number
  to?: number
}

function openShiftTerms(filters: OpenShiftFilters, now: number): SQL[] {
  const terms: SQL[] = [
    sql`s.status = 'OPEN'`,
    sql`p.status <> 'CANCELLED'`,
    // A shift already past cannot be claimed, whatever range was asked for.
    sql`p.starts_at >= ${Math.max(now, filters.from ?? now)}`,
  ]
  if (filters.role) terms.push(sql`s.role = ${filters.role}`)
  if (filters.to !== undefined) terms.push(sql`p.starts_at <= ${filters.to}`)
  return terms
}

export interface OpenShiftRow {
  shiftId: string
  role: ShiftRole
  performanceId: string
  venueId: string
  venueName: string
  showTitle: string
  startsAt: number
}

export function openShiftsQuery(filters: OpenShiftFilters, now: number, limit: number, offset: number): SQL {
  return sql`
    SELECT s.id AS shiftId, s.role AS role, p.id AS performanceId, p.starts_at AS startsAt,
           v.id AS venueId, v.name AS venueName, sh.title AS showTitle
    FROM shifts s
    JOIN performances p ON p.id = s.performance_id
    JOIN venues v ON v.id = p.venue_id
    JOIN shows sh ON sh.id = p.show_id
    ${where(openShiftTerms(filters, now))}
    ORDER BY p.starts_at, s.role, s.slot
    LIMIT ${limit} OFFSET ${offset}
  `
}

export function countOpenShiftsQuery(filters: OpenShiftFilters, now: number): SQL {
  return sql`
    SELECT count(*) AS total
    FROM shifts s
    JOIN performances p ON p.id = s.performance_id
    ${where(openShiftTerms(filters, now))}
  `
}

export interface MyShiftRow {
  shiftId: string
  role: ShiftRole
  status: ShiftStatus
  performanceId: string
  venueName: string
  showTitle: string
  startsAt: number
}

// A member's own shifts, upcoming and not cancelled. Bounded by LIMIT rather than paged: nobody
// holds enough shifts at once to need a second page (E-103).
export function myShiftsQuery(userId: string, now: number): SQL {
  return sql`
    SELECT s.id AS shiftId, s.role AS role, s.status AS status, p.id AS performanceId,
           v.name AS venueName, sh.title AS showTitle, p.starts_at AS startsAt
    FROM shifts s
    JOIN performances p ON p.id = s.performance_id
    JOIN venues v ON v.id = p.venue_id
    JOIN shows sh ON sh.id = p.show_id
    WHERE s.user_id = ${userId} AND s.status <> 'CANCELLED' AND p.starts_at >= ${now}
    ORDER BY p.starts_at, s.role, s.slot
    LIMIT 100
  `
}
