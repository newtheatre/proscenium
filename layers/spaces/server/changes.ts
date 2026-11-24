// Changing and cancelling (spec part 3, rules X1, X4 and X5) and the sweeps that close bookings
// whose time has passed. Each is one guarded statement with its history row and event.
import { sql } from 'drizzle-orm'
import { all, can, nowMs, refuse, useSetting, type Actor, type UnitView } from '#kit'
import { notify } from '#modules/core'
import { history, moveBooking, requireBooking, type Booking } from './bookings'
import { bookingEvents } from './db/schema'
import { bookingWords } from './words'

const SECOND = 1000 // not-policy: settings are whole seconds

export interface Acting { booking: Booking, own: boolean, manage: boolean }

/** The booking and whether the actor is its booker or may manage it; refused if neither. */
export async function actingOn(actor: Actor, id: string): Promise<Acting> {
  const booking = await requireBooking(id)
  const own = !!actor.accountId && booking.bookedFor === actor.accountId
  const manage = (await can(actor, 'spaces.booking.manage', ['spaces.booking', id])).allowed
  if (!own && !manage) refuse('core.access.denied', 'This is not your booking.', { status: 403 })
  if (booking.originType && !manage) refuse('spaces.booking.managed-elsewhere', 'This booking is managed where it was made.', { status: 409, remedy: 'Change it there.' })
  return { booking, own, manage }
}

/** X1: the title, notes and attendee count, at any time before the booking ends. */
export function editDetails(unit: UnitView, acting: Acting, actor: string, input: { title: string, notes: string | null, attendees: number | null }): void {
  const at = nowMs()
  unit.add(sql`UPDATE spaces_bookings SET title = ${input.title}, notes = ${input.notes}, attendees = ${input.attendees}, updated_at = ${at}
    WHERE id = ${acting.booking.id} AND state IN ('requested', 'confirmed') AND ends_at > ${at}`)
    .expect(1, { code: 'spaces.booking.closed', reason: 'This booking can no longer be changed.' })
  history(unit, acting.booking.id, 'changed', actor, at, { detail: { details: true } })
}

/**
 * X4 and X5: cancels a Confirmed booking before it ends. Inside the cancellation notice it is a
 * late cancellation when the booker cancels. Staff give a note, which the booker is sent.
 */
export async function cancelBooking(unit: UnitView, acting: Acting, actor: string, note: string | null): Promise<{ late: boolean }> {
  const { booking } = acting
  const at = nowMs()
  if (booking.state !== 'confirmed') refuse('spaces.booking.wrong-state', booking.state === 'requested' ? 'A request is withdrawn, not cancelled.' : 'This booking is already closed.', { status: 409 })
  const byStaff = !acting.own
  if (byStaff && !note?.trim()) refuse('spaces.booking.note-needed', 'Say why, so the booker knows.', { status: 422 })
  const notice = (await useSetting('spaces.bookings.cancel-notice') as number) * SECOND
  const late = !byStaff && booking.startsAt - at < notice
  const reason = byStaff ? 'by-staff' : 'by-booker'
  moveBooking(unit, booking, {
    to: 'cancelled',
    actor,
    note: note?.trim() || null,
    reason,
    set: sql`late_cancel = ${late ? 1 : 0}`,
    where: sql`ends_at > ${at}`,
    payload: { reason, late },
  }, { code: 'spaces.booking.closed', reason: 'This booking has ended or changed, so it was not cancelled.', remedy: 'Reload it.' })
  return { late }
}

/** The booker takes back a request before it is decided. */
export function withdrawRequest(unit: UnitView, acting: Acting, actor: string): void {
  if (acting.booking.state !== 'requested') refuse('spaces.booking.wrong-state', 'Only a request waiting for a decision can be withdrawn.', { status: 409 })
  moveBooking(unit, acting.booking, { to: 'withdrawn', actor, reason: 'by-booker' })
}

/**
 * The sweep (part 3, "Sweeps and reminders"): a Confirmed booking past its end becomes Completed;
 * a request past its start becomes Expired. Set-wise: one update, one insert of history rows and
 * one set of events per kind. A booking that moved in between is simply not in the set.
 */
export async function sweepBookings(unit: UnitView, limit: number): Promise<{ completed: number, expired: number }> {
  const at = nowMs()
  const done = await all<{ id: string, bookable_id: string }>('SELECT id, bookable_id FROM spaces_bookings WHERE state = \'confirmed\' AND ends_at <= ? ORDER BY ends_at LIMIT ?', at, limit)
  const lapsed = await all<{ id: string, bookable_id: string, booked_for: string }>('SELECT id, bookable_id, booked_for FROM spaces_bookings WHERE state = \'requested\' AND starts_at <= ? ORDER BY starts_at LIMIT ?', at, limit)
  for (const [rows, from, to] of [[done, 'confirmed', 'completed'], [lapsed, 'requested', 'expired']] as const) {
    if (!rows.length) continue
    const ids = JSON.stringify(rows.map(r => r.id))
    unit.add(sql`UPDATE spaces_bookings SET state = ${to}, updated_at = ${at} WHERE id IN (SELECT value FROM json_each(${ids})) AND state = ${from}`)
      .expect(rows.length, { code: 'spaces.sweep.moved', reason: 'A booking changed during the sweep.' })
    unit.insertSet(bookingEvents, rows.map(r => ({ bookingId: r.id, kind: to, actor: null, at })))
    unit.announce(`spaces.booking.${to}`, rows.map(r => ({ payload: { bookingId: r.id, bookableId: r.bookable_id }, record: ['spaces.booking', r.id] as const })))
  }
  // A6: the booker of a request nobody decided in time is told.
  for (const r of lapsed) await notify(unit, 'spaces.request-expired', { to: r.booked_for, variables: await bookingWords(r.id), dedupeKey: `expired:${r.id}`, subject: ['spaces.booking', r.id] })
  return { completed: done.length, expired: lapsed.length }
}
