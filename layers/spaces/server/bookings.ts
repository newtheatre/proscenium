// The heart of room booking (spec part 3): the write that cannot double-book (rule C2), and every
// state move as one guarded update with its history row and its event (the moves table). Rules
// that decide whether to ask at all (P1 to P13) build on these and never write by another road.
import { sql, type SQL } from 'drizzle-orm'
import { all, first, newId, nowMs, refuse, type UnitView } from '#kit'
import { assertNoVenueClosure, assertSpaceFree, closuresBetween, listPerformances } from '#modules/core'
import { canMove, movesInto, type BookingEventKind, type BookingState, type ClosedReason } from '../shared/states'

export interface Bookable {
  id: string
  kind: 'space' | 'resource'
  spaceId: string | null
  homeVenueId: string | null
  control: 'own' | 'external'
  state: 'active' | 'paused' | 'archived'
}

export interface Booking {
  id: string
  bookableId: string
  purposeId: string
  tier: number
  seriesId: string | null
  startsAt: number
  endsAt: number
  state: BookingState
  bookedFor: string
  requestedBy: string
  productionId: string | null
  originType: string | null
  originId: string | null
  title: string
  bumps: boolean
}

/** Something in the way of a window (rule C1). A title is given only where the reader may see it (K2). */
export interface Blocker {
  kind: 'booking' | 'performance' | 'closure'
  id: string
  startsAt: number
  endsAt: number
  tier?: number
  bookedFor?: string
}

export const CLASH = { code: 'spaces.clash', reason: 'Someone else has just taken this time.', remedy: 'Choose another time.' }
const MOVED = { code: 'spaces.booking.changed', reason: 'This booking changed just now, so nothing was saved.', remedy: 'Reload it and try again.' }

const toBookable = (r: any): Bookable => ({ id: r.id, kind: r.kind, spaceId: r.space_id, homeVenueId: r.home_venue_id, control: r.control, state: r.state })
const toBooking = (r: any): Booking => ({
  id: r.id, bookableId: r.bookable_id, purposeId: r.purpose_id, tier: r.tier, seriesId: r.series_id, startsAt: r.starts_at, endsAt: r.ends_at,
  state: r.state, bookedFor: r.booked_for, requestedBy: r.requested_by, productionId: r.production_id, originType: r.origin_type, originId: r.origin_id,
  title: r.title, bumps: !!r.bumps,
})

export async function getBookable(id: string): Promise<Bookable | null> {
  const row = await first('SELECT id, kind, space_id, home_venue_id, control, state FROM spaces_bookables WHERE id = ?', id)
  return row ? toBookable(row) : null
}

export async function requireBookable(id: string): Promise<Bookable> {
  return await getBookable(id) ?? refuse('spaces.not-bookable', 'There is no such room or resource to book.', { status: 404 })
}

export async function getBooking(id: string): Promise<Booking | null> {
  const row = await first('SELECT * FROM spaces_bookings WHERE id = ?', id)
  return row ? toBooking(row) : null
}

export async function requireBooking(id: string): Promise<Booking> {
  return await getBooking(id) ?? refuse('spaces.booking.not-found', 'There is no such room booking.', { status: 404 })
}

/** No Confirmed booking of this bookable overlaps [from, to). `except` leaves out the booking being moved. */
export function noOverlap(bookableId: string | SQL, from: number | SQL, to: number | SQL, except: string | null = null): SQL {
  return sql`NOT EXISTS (SELECT 1 FROM spaces_bookings o WHERE o.bookable_id = ${bookableId} AND o.state = 'confirmed'
    AND o.starts_at < ${to} AND o.ends_at > ${from} AND o.id IS NOT ${except})`
}

/**
 * The predicate every confirming statement carries (rule C2): no Confirmed booking overlaps, and for
 * a space no scheduled performance or blocking closure does (core's assertSpaceFree); for a resource,
 * no blocking closure of its home venue or of the whole theatre. On the statement, never in a read.
 */
export function bookableFree(bookable: Bookable, from: number, to: number, except: string | null = null): SQL {
  const place = bookable.kind === 'space' ? assertSpaceFree(bookable.spaceId!, from, to) : assertNoVenueClosure(bookable.homeVenueId, from, to)
  return sql`(${noOverlap(bookable.id, from, to, except)} AND ${place})`
}

/** Everything in the way of a window, soonest first (rule C1). A read, for showing and for choosing a refusal. */
export async function blockersOf(bookable: Bookable, from: number, to: number, except: string | null = null): Promise<Blocker[]> {
  const found: Blocker[] = (await all<{ id: string, starts_at: number, ends_at: number, tier: number, booked_for: string }>(
    'SELECT id, starts_at, ends_at, tier, booked_for FROM spaces_bookings WHERE bookable_id = ? AND state = \'confirmed\' AND starts_at < ? AND ends_at > ? AND id IS NOT ? ORDER BY starts_at, id',
    bookable.id, to, from, except,
  )).map(r => ({ kind: 'booking', id: r.id, startsAt: r.starts_at, endsAt: r.ends_at, tier: r.tier, bookedFor: r.booked_for }))
  if (bookable.kind === 'space') {
    for (const p of await listPerformances({ spaceId: bookable.spaceId!, state: 'scheduled', from, to }))
      found.push({ kind: 'performance', id: p.id, startsAt: p.startsAt, endsAt: p.endsAt })
  }
  const closures = bookable.kind === 'space'
    ? await closuresBetween(from, to, { spaceId: bookable.spaceId! })
    : (await closuresBetween(from, to)).filter(c => c.venueId === null || (c.spaceId === null && c.venueId === bookable.homeVenueId))
  for (const c of closures) if (c.kind === 'closure' && c.blocksPerformances) found.push({ kind: 'closure', id: c.id, startsAt: c.startsAt, endsAt: c.endsAt })
  return found.sort((a, b) => a.startsAt - b.startsAt)
}

export interface NewBooking {
  bookable: Bookable
  purposeId: string
  startsAt: number
  endsAt: number
  state: 'requested' | 'confirmed'
  bookedFor: string
  requestedBy: string
  title: string
  notes?: string | null
  attendees?: number | null
  productionId?: string | null
  seriesId?: string | null
  origin?: { type: string, id: string } | null
  overrideReason?: string | null
  bumps?: boolean
  replacesId?: string | null
}

/**
 * Statements that make one booking. A Confirmed one is one insert carrying the clash predicate
 * (rule C2), so of two people confirming overlapping times exactly one succeeds and the other is
 * refused `spaces.clash`. A Requested one takes no time (rule C4). The tier is copied from the
 * purpose inside the statement. Returns the booking's id.
 */
export function insertBooking(unit: UnitView, input: NewBooking, actor: string | null): string {
  const id = newId('bkg')
  const at = nowMs()
  const guard = input.state === 'confirmed' ? bookableFree(input.bookable, input.startsAt, input.endsAt) : sql`1`
  unit.add(sql`INSERT INTO spaces_bookings (id, bookable_id, purpose_id, tier, series_id, starts_at, ends_at, state, booked_for, requested_by, production_id,
      origin_type, origin_id, title, notes, attendees, replaces_id, bumps, override_reason, late_cancel, no_show, created_at, updated_at)
    SELECT ${id}, ${input.bookable.id}, p.id, p.tier, ${input.seriesId ?? null}, ${input.startsAt}, ${input.endsAt}, ${input.state}, ${input.bookedFor}, ${input.requestedBy}, ${input.productionId ?? null},
      ${input.origin?.type ?? null}, ${input.origin?.id ?? null}, ${input.title}, ${input.notes ?? null}, ${input.attendees ?? null}, ${input.replacesId ?? null}, ${input.bumps ? 1 : 0}, ${input.overrideReason ?? null}, 0, 0, ${at}, ${at}
    FROM spaces_purposes p WHERE p.id = ${input.purposeId} AND ${guard}`).expect(1, CLASH)
  history(unit, id, input.state === 'confirmed' ? 'confirmed' : 'requested', actor, at)
  const times = { bookingId: id, bookableId: input.bookable.id, startsAt: input.startsAt, endsAt: input.endsAt, seriesId: input.seriesId ?? null }
  if (input.state === 'confirmed') unit.announce('spaces.booking.confirmed', { ...times, decided: false }, { record: ['spaces.booking', id] })
  else unit.announce('spaces.booking.requested', times, { record: ['spaces.booking', id] })
  return id
}

/** One row of a booking's own history, in the caller's unit. */
export function history(unit: UnitView, bookingId: string, kind: BookingEventKind, actor: string | null, at = nowMs(), extra: { detail?: Record<string, unknown>, note?: string | null } = {}): void {
  unit.add(sql`INSERT INTO spaces_booking_events (id, booking_id, kind, actor, at, detail, note)
    VALUES (${newId('bke')}, ${bookingId}, ${kind}, ${actor}, ${at}, ${extra.detail ? JSON.stringify(extra.detail) : null}, ${extra.note ?? null})`)
}

export interface Move {
  to: Exclude<BookingState, 'requested'>
  actor: string | null
  note?: string | null
  reason?: ClosedReason
  /** Further columns to set with the move. */
  set?: SQL
  /** Further conditions on the move, beyond the state it expects. */
  where?: SQL
  /** Event payload beyond the ids. */
  payload?: Record<string, unknown>
}

const EVENT_OF: Record<Move['to'], string> = {
  confirmed: 'spaces.booking.confirmed',
  declined: 'spaces.booking.declined',
  withdrawn: 'spaces.booking.withdrawn',
  expired: 'spaces.booking.expired',
  cancelled: 'spaces.booking.cancelled',
  bumped: 'spaces.booking.bumped',
  completed: 'spaces.booking.completed',
}

/**
 * Moves one booking to another state: one conditional update that names the states it may come
 * from, so two people acting at once cannot both succeed; its history row and its event follow
 * in the same unit. A move the table does not allow is refused before anything is written.
 */
export function moveBooking(unit: UnitView, booking: Booking, move: Move, refusal = MOVED): void {
  if (!canMove(booking.state, move.to)) refuse('spaces.booking.wrong-state', `A ${booking.state} booking cannot become ${move.to}.`, { status: 409 })
  const at = nowMs()
  const from = movesInto(move.to)
  unit.add(sql`UPDATE spaces_bookings SET state = ${move.to}, closed_reason = coalesce(${move.reason ?? null}, closed_reason), updated_at = ${at}${move.set ? sql`, ${move.set}` : sql``}
    WHERE id = ${booking.id} AND state IN (${sql.join(from.map(s => sql`${s}`), sql`, `)})${move.where ? sql` AND ${move.where}` : sql``}`).expect(1, refusal)
  history(unit, booking.id, move.to, move.actor, at, { note: move.note ?? null, detail: move.reason ? { reason: move.reason } : undefined })
  unit.announce(EVENT_OF[move.to], { bookingId: booking.id, bookableId: booking.bookableId, ...move.payload }, { record: ['spaces.booking', booking.id] })
}

/**
 * Confirms a request (rule A4): the move carries the clash predicate again, at this moment, so a
 * time taken since the request was made refuses `spaces.clash` and leaves the request Requested.
 */
export function confirmRequest(unit: UnitView, booking: Booking, bookable: Bookable, decider: string, note: string | null = null): void {
  const at = nowMs()
  moveBooking(unit, booking, {
    to: 'confirmed',
    actor: decider,
    note,
    set: sql`decided_by = ${decider}, decided_at = ${at}, decision_note = ${note}`,
    where: sql`bookable_id = ${bookable.id} AND starts_at = ${booking.startsAt} AND ends_at = ${booking.endsAt} AND ${bookableFree(bookable, booking.startsAt, booking.endsAt, booking.id)}`,
    payload: { startsAt: booking.startsAt, endsAt: booking.endsAt, seriesId: booking.seriesId, decided: true },
  }, CLASH)
}

/**
 * Moves a Confirmed booking to another time or bookable in one statement that carries the clash
 * condition (rule X2): the old time is released and the new one taken together, or nothing changes.
 */
export function changeTime(unit: UnitView, booking: Booking, to: { bookable: Bookable, startsAt: number, endsAt: number }, actor: string | null): void {
  if (booking.state !== 'confirmed') refuse('spaces.booking.wrong-state', 'Only a confirmed booking can be moved.', { status: 409 })
  const at = nowMs()
  unit.add(sql`UPDATE spaces_bookings SET bookable_id = ${to.bookable.id}, starts_at = ${to.startsAt}, ends_at = ${to.endsAt}, updated_at = ${at}
    WHERE id = ${booking.id} AND state = 'confirmed' AND bookable_id = ${booking.bookableId} AND starts_at = ${booking.startsAt} AND ends_at = ${booking.endsAt}
      AND ${bookableFree(to.bookable, to.startsAt, to.endsAt, booking.id)}`).expect(1, CLASH)
  const detail = { fromBookableId: booking.bookableId, toBookableId: to.bookable.id, fromStartsAt: booking.startsAt, fromEndsAt: booking.endsAt, toStartsAt: to.startsAt, toEndsAt: to.endsAt }
  history(unit, booking.id, 'changed', actor, at, { detail })
  unit.announce('spaces.booking.changed', {
    bookingId: booking.id, bookableId: to.bookable.id, oldBookableId: booking.bookableId,
    oldStartsAt: booking.startsAt, oldEndsAt: booking.endsAt, startsAt: to.startsAt, endsAt: to.endsAt,
  }, { record: ['spaces.booking', booking.id] })
}
