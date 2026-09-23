import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
// Named rather than taken from Nitro's auto-imports, because `tests/` typechecks this file under
// Bun, where nothing is auto-imported (CONTRIBUTING).
import { createError } from 'h3'
import { approveSlotStatement, claimSlotStatement, declineSlotStatement, ourVenue } from './rota'
import { predicate, whereFrom } from './list-filters'
import { barOpeningConstraintRefusal } from '#shared/utils/rota-openings'
import { rotaOpeningsList } from '#shared/utils/rota-openings-list'
import type { ClaimScope } from './rota'
import type { ListClause } from './list-filters'
import type { ListQuery } from '#shared/utils/list-filters'
import type { AuditRow } from '#shared/utils/audit'
import type { BarOpeningInput, BarOpeningStatus } from '#shared/utils/rota-openings'
import type { ShiftStatus } from '#shared/utils/rota'
import type { SQL } from 'drizzle-orm'

// Reading and writing bar openings (E-130, 0077). Every statement here binds a fixed number of
// parameters however many slots an opening holds (0003, 0006).

// The second table the rota's claim path serves, so a claim on an opening settles under the same
// conditional write a claim on a performance does (0077).
export const OPENING_CLAIM_SCOPE: ClaimScope = { table: 'bar_opening_shifts', event: 'opening_id' }

// Conditional on the venue's bar row, so a template emptied between the read and the write
// leaves no opening at all rather than one nobody can claim a slot on (E-130 criterion 2).
export function createOpeningStatement(openingId: string, input: BarOpeningInput, actorId: string): SQL {
  return sql`
    INSERT INTO bar_openings (id, venue_id, night, label, starts_at, ends_at, status, created_by)
    SELECT ${openingId}, ${input.venueId}, ${input.night}, ${input.label},
           ${input.startsAt}, ${input.endsAt}, 'PLANNED', ${actorId}
    WHERE EXISTS (SELECT 1 FROM shift_templates t WHERE t.venue_id = ${input.venueId} AND t.role = 'BAR' AND ${ourVenue('t')})
    RETURNING id
  `
}

// Every slot the venue's bar row asks for, numbered from one. The ordinals come out of a
// recursive count rather than out of the request, so this binds one parameter (0006).
export function stampOpeningShiftsStatement(openingId: string): SQL {
  // Bounded by this venue's own bar count, so a house with twenty door staff does not make every
  // other venue's opening walk twenty rows (0006).
  const barCount = sql`(
    SELECT coalesce(t."count", 0)
    FROM bar_openings o
    JOIN shift_templates t ON t.venue_id = o.venue_id AND t.role = 'BAR' AND ${ourVenue('t')}
    WHERE o.id = ${openingId}
  )`
  return sql`
    WITH RECURSIVE slot(i) AS (
      SELECT 1
      UNION ALL
      SELECT i + 1 FROM slot WHERE i < ${barCount}
    )
    INSERT INTO bar_opening_shifts (id, opening_id, slot, status)
    SELECT lower(hex(randomblob(16))), o.id, slot.i, 'OPEN'
    FROM bar_openings o
    JOIN shift_templates t ON t.venue_id = o.venue_id AND t.role = 'BAR' AND ${ourVenue('t')}
    JOIN slot ON slot.i <= t."count"
    WHERE o.id = ${openingId}
    ON CONFLICT DO NOTHING
    RETURNING id
  `
}

// One more bar slot on a planned opening, numbered after the highest it holds. The template is
// untouched: a one-off is this opening's business (E-130 criterion 7).
export function addOpeningShiftStatement(slotId: string, openingId: string): SQL {
  return sql`
    INSERT INTO bar_opening_shifts (id, opening_id, slot, status)
    SELECT ${slotId}, o.id,
           coalesce((SELECT max(s.slot) FROM bar_opening_shifts s WHERE s.opening_id = o.id), 0) + 1,
           'OPEN'
    FROM bar_openings o
    WHERE o.id = ${openingId} AND o.status = 'PLANNED'
    RETURNING id, slot
  `
}

// The added slot's audit row, conditional on the insert and carrying the number the insert
// chose, so the entry names both the slot's id and its number (0049, 0011).
export function addedSlotAuditStatement(entry: AuditRow, slotId: string): SQL {
  return sql`
    INSERT INTO audit_log (id, actor_id, action, target, detail)
    SELECT ${entry.id}, ${entry.actorId}, ${entry.action}, ${entry.target},
           json_set(${JSON.stringify(entry.detail ?? {})}, '$.changes.slot.to', s.slot)
    FROM bar_opening_shifts s
    WHERE s.id = ${slotId} AND changes() = 1
  `
}

// Only an open slot on a planned opening that keeps another slot goes, and the predicate rides
// the delete, so a claim landing first wins and a removal after it is refused (0003).
export function removeOpeningShiftStatement(slotId: string): SQL {
  return sql`
    DELETE FROM bar_opening_shifts AS target
    WHERE target.id = ${slotId}
      AND target.status = 'OPEN'
      AND EXISTS (SELECT 1 FROM bar_openings o WHERE o.id = target.opening_id AND o.status = 'PLANNED')
      AND EXISTS (
        SELECT 1 FROM bar_opening_shifts AS other
        WHERE other.opening_id = target.opening_id AND other.id <> target.id AND other.status <> 'CANCELLED'
      )
    RETURNING id, slot
  `
}

// How many slots an opening still staffs, read only to explain a refused removal.
export async function openingSlotsRemaining(openingId: string): Promise<number> {
  const [row] = await db.all<{ n: number }>(sql`
    SELECT count(*) AS n FROM bar_opening_shifts WHERE opening_id = ${openingId} AND status <> 'CANCELLED'
  `)
  return row?.n ?? 0
}

// How many bar slots a venue stamps, read before the write so a venue with no bar row is told
// rather than guessed at (E-130 criterion 2).
export function barSlotCountQuery(venueId: string): SQL {
  return sql`SELECT t."count" AS n FROM shift_templates t WHERE t.venue_id = ${venueId} AND t.role = 'BAR' AND ${ourVenue('t')}`
}

export async function barSlotCount(venueId: string): Promise<number> {
  const [row] = await db.all<{ n: number }>(barSlotCountQuery(venueId))
  return row?.n ?? 0
}

export function cancelOpeningStatement(openingId: string): SQL {
  return sql`
    UPDATE bar_openings SET status = 'CANCELLED'
    WHERE id = ${openingId} AND status = 'PLANNED'
    RETURNING id
  `
}

// A cancelled opening is not a night's work, so its slots go with it. Whoever held one keeps
// their name on it; an open one had nobody (E-130 criterion 5).
export function cancelOpeningShiftsStatement(openingId: string): SQL {
  return sql`
    UPDATE bar_opening_shifts SET status = 'CANCELLED'
    WHERE opening_id = ${openingId} AND status <> 'CANCELLED'
  `
}

export interface OpeningSlot { slotId: string, userId: string | null, status: ShiftStatus }

// Everything a cancellation has to reckon with, read before the write that takes the status
// away: an open slot has nobody to tell, a claimed or confirmed one does (E-130 criterion 5).
export async function activeOpeningShifts(openingId: string): Promise<OpeningSlot[]> {
  return await db.all<OpeningSlot>(sql`
    SELECT id AS slotId, user_id AS userId, status
    FROM bar_opening_shifts
    WHERE opening_id = ${openingId} AND status <> 'CANCELLED'
    ORDER BY slot
  `)
}

export function claimOpeningShiftStatement(slotId: string, userId: string, status: ShiftStatus): SQL {
  return claimSlotStatement(OPENING_CLAIM_SCOPE, slotId, userId, status)
}

export function approveOpeningShiftStatement(slotId: string): SQL {
  return approveSlotStatement(OPENING_CLAIM_SCOPE, slotId)
}

export function declineOpeningShiftStatement(slotId: string, reason: string): SQL {
  return declineSlotStatement(OPENING_CLAIM_SCOPE, slotId, reason)
}

// An officer putting somebody on a slot, or taking them off it: one UPDATE on the row that
// already exists, never a delete and an insert (E-107 criteria 3 and 4).
export function assignOpeningShiftStatement(slotId: string, userId: string, actorId: string): SQL {
  return sql`
    UPDATE bar_opening_shifts AS target
    SET user_id = ${userId}, status = 'CONFIRMED', assigned_by = ${actorId},
        claimed_at = unixepoch(), confirmed_at = unixepoch(), decline_reason = NULL
    WHERE target.id = ${slotId}
      AND target.status <> 'CANCELLED'
      AND NOT EXISTS (
        SELECT 1 FROM bar_opening_shifts AS other
        WHERE other.opening_id = target.opening_id
          AND other.id <> target.id
          AND other.user_id = ${userId}
          AND other.status IN ('CLAIMED', 'CONFIRMED')
      )
    RETURNING id
  `
}

// The holder's own release: the slot returns to OPEN naming nobody, the same shape a fresh stamp
// leaves, exactly as a shift's own release does (E-107 criterion 1).
export function releaseOpeningShiftStatement(slotId: string, userId: string): SQL {
  return sql`
    UPDATE bar_opening_shifts
    SET status = 'OPEN', user_id = NULL, claimed_at = NULL, confirmed_at = NULL
    WHERE id = ${slotId} AND user_id = ${userId} AND status IN ('CLAIMED', 'CONFIRMED')
    RETURNING id
  `
}

// A member clearing a declined claim off their own rota, as E-114 lets them for a shift.
export function dismissOpeningShiftStatement(slotId: string, userId: string): SQL {
  return sql`
    UPDATE bar_opening_shifts
    SET status = 'OPEN', user_id = NULL, claimed_at = NULL, confirmed_at = NULL, decline_reason = NULL
    WHERE id = ${slotId} AND user_id = ${userId} AND status = 'DECLINED'
    RETURNING id
  `
}

// A declined slot is included, because nothing else reopens one: an opening has no approvals
// queue of its own, so a decline would otherwise strand the slot with a name on it (E-107).
export function unconfirmOpeningShiftStatement(slotId: string): SQL {
  return sql`
    UPDATE bar_opening_shifts
    SET status = 'OPEN', user_id = NULL, assigned_by = NULL, claimed_at = NULL, confirmed_at = NULL,
        decline_reason = NULL
    WHERE id = ${slotId} AND status IN ('CLAIMED', 'CONFIRMED', 'DECLINED')
    RETURNING id
  `
}

export interface BarOpeningRow {
  openingId: string
  venueId: string
  venueName: string
  night: string
  label: string
  startsAt: number
  endsAt: number
  status: BarOpeningStatus
}

export interface BarOpeningShiftRow {
  slotId: string
  openingId: string
  slot: number
  status: ShiftStatus
  userId: string | null
  holderName: string | null
}

// A column already qualified by its own alias (`o.status`, `v.name`): the declaration names two
// joined tables, so one alias would not do (K-129).
const rawColumn = (name: string): SQL => sql.raw(name)

export function openingsClause(query: ListQuery): ListClause {
  return whereFrom(rotaOpeningsList, query, {
    column: rawColumn,
    search: [sql`o.label`, sql`v.name`],
  })
}

export function openingsQuery(clause: ListClause, limit: number, offset: number): SQL {
  return sql`
    SELECT o.id AS openingId, o.venue_id AS venueId, v.name AS venueName, o.night AS night,
           o.label AS label, o.starts_at AS startsAt, o.ends_at AS endsAt, o.status AS status
    FROM bar_openings o
    JOIN venues v ON v.id = o.venue_id
    ${predicate(clause)}
    ORDER BY ${sql.join(clause.orderBy, sql`, `)}
    LIMIT ${limit} OFFSET ${offset}
  `
}

export function countOpeningsQuery(clause: ListClause): SQL {
  return sql`
    SELECT count(*) AS total
    FROM bar_openings o
    JOIN venues v ON v.id = o.venue_id
    ${predicate(clause)}
  `
}

// The slots of the openings the page holds, scoped by the same predicate read a second time
// rather than by an id list carried back from a result set (0006).

// Who holds a slot is an officer's view: the member-facing open-shift list carries no person
// column at all, and a declined claim names somebody who is owed no audience (E-103, 0011).
export function openingShiftsQuery(clause: ListClause, limit: number, offset: number, withHolders: boolean): SQL {
  const holder = withHolders ? sql`s.user_id AS userId, u.name AS holderName` : sql`NULL AS userId, NULL AS holderName`
  return sql`
    SELECT s.id AS slotId, s.opening_id AS openingId, s.slot AS slot, s.status AS status,
           ${holder}
    FROM bar_opening_shifts s
    LEFT JOIN users u ON u.id = s.user_id
    WHERE s.opening_id IN (
      SELECT o.id FROM bar_openings o
      JOIN venues v ON v.id = o.venue_id
      ${predicate(clause)}
      ORDER BY ${sql.join(clause.orderBy, sql`, `)}
      LIMIT ${limit} OFFSET ${offset}
    )
    ORDER BY s.opening_id, s.slot
  `
}

export interface MyOpeningShiftRow {
  slotId: string
  openingId: string
  slot: number
  status: ShiftStatus
  label: string
  venueName: string
  startsAt: number
  endsAt: number
}

// A member's own opening slots, upcoming and not cancelled, labelled by the opening rather than
// by a show title (E-130 criterion 4). Bounded by LIMIT, as `myShiftsQuery` is.
export function myOpeningShiftsQuery(userId: string, now: number): SQL {
  return sql`
    SELECT s.id AS slotId, o.id AS openingId, s.slot AS slot, s.status AS status,
           o.label AS label, v.name AS venueName, o.starts_at AS startsAt, o.ends_at AS endsAt
    FROM bar_opening_shifts s
    JOIN bar_openings o ON o.id = s.opening_id
    JOIN venues v ON v.id = o.venue_id
    WHERE s.user_id = ${userId} AND s.status <> 'CANCELLED' AND o.status <> 'CANCELLED'
      AND o.ends_at >= ${now}
    ORDER BY o.starts_at, s.slot
    LIMIT 100
  `
}

export interface OpenOpeningShiftRow {
  slotId: string
  openingId: string
  slot: number
  label: string
  venueId: string
  venueName: string
  startsAt: number
  endsAt: number
}

// The open slots an opening still has, offered beside the rota's own open shifts (criterion 4).
// Bounded by count rather than paged: a night holds a handful of openings, not a page of them.
export function openOpeningShiftsQuery(window: { from?: number, to?: number }, now: number, limit: number): SQL {
  // The same window the open-shift list narrows by, so a reader filtering to a fortnight is not
  // handed every opening the season holds.
  const notBefore = Math.max(now, window.from ?? now)
  const notAfter = window.to === undefined ? sql`` : sql` AND o.starts_at <= ${window.to}`
  return sql`
    SELECT s.id AS slotId, o.id AS openingId, s.slot AS slot, o.label AS label,
           v.id AS venueId, v.name AS venueName, o.starts_at AS startsAt, o.ends_at AS endsAt
    FROM bar_opening_shifts s
    JOIN bar_openings o ON o.id = s.opening_id
    JOIN venues v ON v.id = o.venue_id
    WHERE s.status = 'OPEN' AND o.status <> 'CANCELLED' AND o.starts_at >= ${notBefore}${notAfter}
    ORDER BY o.starts_at, s.slot
    LIMIT ${limit}
  `
}

export type BarOpeningDetail = BarOpeningRow

export async function openingDetail(openingId: string): Promise<BarOpeningDetail | null> {
  const [row] = await db.all<BarOpeningDetail>(sql`
    SELECT o.id AS openingId, o.venue_id AS venueId, v.name AS venueName, o.night AS night,
           o.label AS label, o.starts_at AS startsAt, o.ends_at AS endsAt, o.status AS status
    FROM bar_openings o
    JOIN venues v ON v.id = o.venue_id
    WHERE o.id = ${openingId}
  `)
  return row ?? null
}

export interface OpeningShiftDetail {
  slotId: string
  openingId: string
  slot: number
  status: ShiftStatus
  userId: string | null
  openingStatus: BarOpeningStatus
  venueId: string
  venueName: string
  label: string
  startsAt: number
  endsAt: number
}

// What every claim, approval and decline reads before it writes: enough to 404, to build the
// refusal on a losing write, and to notify without a second query.
export async function openingShiftDetail(slotId: string): Promise<OpeningShiftDetail | null> {
  const [row] = await db.all<OpeningShiftDetail>(sql`
    SELECT s.id AS slotId, s.opening_id AS openingId, s.slot AS slot, s.status AS status,
           s.user_id AS userId, o.status AS openingStatus, o.venue_id AS venueId, v.name AS venueName,
           o.label AS label, o.starts_at AS startsAt, o.ends_at AS endsAt
    FROM bar_opening_shifts s
    JOIN bar_openings o ON o.id = s.opening_id
    JOIN venues v ON v.id = o.venue_id
    WHERE s.id = ${slotId}
  `)
  return row ?? null
}

export interface ConfirmedOpeningShift {
  shiftId: string
  openingId: string
  venueId: string
  startsAt: number
  endsAt: number
}

// The third fact BAR authority derives from: a confirmed slot on a planned opening inside
// tonight's own bounds (0077). Disabled and anonymised are re-checked, not trusted.
export function confirmedOpeningShiftsTonightQuery(
  userId: string,
  from: number,
  to: number,
  scope: { venueId?: string } = {},
): SQL {
  const atVenue = scope.venueId ? sql` AND o.venue_id = ${scope.venueId}` : sql``
  return sql`
    SELECT s.id AS shiftId, o.id AS openingId, o.venue_id AS venueId,
           o.starts_at AS startsAt, o.ends_at AS endsAt
    FROM bar_opening_shifts s
    JOIN bar_openings o ON o.id = s.opening_id
    JOIN users u ON u.id = s.user_id
    WHERE s.user_id = ${userId}
      AND s.status = 'CONFIRMED'
      AND o.status <> 'CANCELLED'
      AND o.starts_at >= ${from} AND o.starts_at < ${to}
      AND u.disabled = 0
      AND u.anonymised_at IS NULL${atVenue}
    ORDER BY o.starts_at
  `
}

export interface OpeningVenueTonight { venueId: string, venueName: string, label: string }

// The venues a caller works an opening at tonight: the till's own picker (F-125, 0077). Disabled
// and anonymised are re-checked, so it never offers what the guard is about to refuse.
export async function openingVenuesTonight(userId: string, from: number, to: number): Promise<OpeningVenueTonight[]> {
  return await db.all<OpeningVenueTonight>(sql`
    SELECT o.venue_id AS venueId, v.name AS venueName, o.label AS label
    FROM bar_opening_shifts s
    JOIN bar_openings o ON o.id = s.opening_id
    JOIN venues v ON v.id = o.venue_id
    JOIN users u ON u.id = s.user_id
    WHERE s.user_id = ${userId}
      AND s.status = 'CONFIRMED'
      AND o.status <> 'CANCELLED'
      AND o.starts_at >= ${from} AND o.starts_at < ${to}
      AND u.disabled = 0
      AND u.anonymised_at IS NULL
    ORDER BY o.starts_at
  `)
}

// What an officer let themselves into on a night with no performance, so the bypass row can say
// which opening it was (0077). The earliest planned one, where a venue has more than one.
export async function plannedOpeningTonight(venueId: string, night: string): Promise<string | null> {
  const [row] = await db.all<{ openingId: string }>(sql`
    SELECT id AS openingId FROM bar_openings
    WHERE venue_id = ${venueId} AND night = ${night} AND status = 'PLANNED'
    ORDER BY starts_at LIMIT 1
  `)
  return row?.openingId ?? null
}

export async function confirmedOpeningShiftsTonight(
  userId: string,
  from: number,
  to: number,
  scope: { venueId?: string } = {},
): Promise<ConfirmedOpeningShift[]> {
  return await db.all<ConfirmedOpeningShift>(confirmedOpeningShiftsTonightQuery(userId, from, to, scope))
}

// A raw constraint failure is never what a caller reads back; anything unrecognised is rethrown,
// because swallowing it would turn a defect into a 409 nobody investigates (E-106 criterion 3).
export async function withOpeningConstraints<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write()
  }
  catch (error) {
    const refusal = barOpeningConstraintRefusal(error)
    if (!refusal) throw error
    throw createError(refusal)
  }
}
