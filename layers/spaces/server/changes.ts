// Changing and cancelling (spec part 3, rules X1, X4 and X5) and the sweeps that close bookings
// whose time has passed. Each is one guarded statement with its history row and event.
import { sql } from 'drizzle-orm'
import { all, can, first, nowMs, refuse, useSetting, type Actor, type UnitView } from '#kit'
import { notify } from '#modules/core'
import { changeTime, history, insertBooking, moveBooking, requireBookable, requireBooking, type Booking } from './bookings'
import { bookingEvents } from './db/schema'
import { checkRequest, type Verdict } from './rules'
import { bookingWords } from './words'

const SECOND = 1000 // not-policy: settings are whole seconds
const DAY = 86_400_000 // not-policy: unit of time
const NO_SHOW_DAYS = 14 // not-policy: rule X6's fixed window

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

/**
 * X2 and X3: a Confirmed booking to another time or room, as a new ask under every rule. With no
 * decision needed it moves in one statement carrying the clash condition; otherwise a request that
 * replaces it is made, and the booking keeps its time until that request is confirmed.
 */
export async function moveOrAsk(unit: UnitView, acting: Acting, actor: Actor, to: { bookableId: string, startsAt: number, endsAt: number, overrideReason: string | null }): Promise<{ bookingId: string, state: 'confirmed' | 'requested', verdict: Verdict }> {
  const { booking } = acting
  if (booking.state !== 'confirmed') refuse('spaces.booking.wrong-state', 'Only a confirmed booking can be moved; withdraw a request and ask again.', { status: 409 })
  if (booking.startsAt <= nowMs()) refuse('spaces.booking.started', 'This booking has started, so it can no longer be moved.', { status: 409 })
  const waiting = await first('SELECT 1 FROM spaces_bookings WHERE replaces_id = ? AND state = \'requested\' LIMIT 1', booking.id)
  if (waiting) refuse('spaces.booking.change-waiting', 'A change to this booking is already waiting for a decision.', { status: 409, remedy: 'Withdraw it first.' })
  const verdict = await checkRequest(actor, { bookableId: to.bookableId, purposeId: booking.purposeId, startsAt: to.startsAt, endsAt: to.endsAt, productionId: booking.productionId, bookedFor: booking.bookedFor, overrideReason: to.overrideReason, replaces: booking.id })
  if (verdict.outcome === 'refused') refuse(verdict.code!, verdict.reason!, { status: verdict.code === 'spaces.clash' ? 409 : 422, remedy: verdict.remedy }) // not-policy: HTTP statuses
  const bookable = await requireBookable(to.bookableId)
  const by = actor.accountId ?? null
  if (verdict.outcome === 'confirm') {
    changeTime(unit, booking, { bookable, startsAt: to.startsAt, endsAt: to.endsAt }, by)
    return { bookingId: booking.id, state: 'confirmed', verdict }
  }
  const bookingId = insertBooking(unit, {
    bookable, purposeId: booking.purposeId, startsAt: to.startsAt, endsAt: to.endsAt, state: 'requested', bookedFor: booking.bookedFor, requestedBy: by!,
    title: booking.title, notes: booking.notes, attendees: booking.attendees, productionId: booking.productionId, replacesId: booking.id,
    overrideReason: verdict.overridden.length ? to.overrideReason : null, bumps: !!verdict.bumps,
  }, by)
  return { bookingId, state: 'requested', verdict }
}

/** X3: once the request replacing it is confirmed, the old booking is cancelled in the same unit, first, so its time is free. */
export function releaseReplaced(unit: UnitView, request: Booking, replaced: Booking | null, decider: string): void {
  if (!replaced || replaced.state !== 'confirmed') return
  moveBooking(unit, replaced, { to: 'cancelled', actor: decider, reason: 'by-booker', note: null, where: sql`ends_at > ${nowMs()}`, payload: { reason: 'by-booker', late: false } })
}

/** X6: the no-show mark on a Completed booking, for 14 days after it ends. It changes nothing by itself. */
export function setNoShow(unit: UnitView, booking: Booking, actor: string, noShow: boolean): void {
  if (booking.state !== 'completed') refuse('spaces.booking.wrong-state', 'Only a booking that has happened can be marked as a no-show.', { status: 409 })
  const at = nowMs()
  unit.add(sql`UPDATE spaces_bookings SET no_show = ${noShow ? 1 : 0}, updated_at = ${at}
    WHERE id = ${booking.id} AND state = 'completed' AND no_show = ${noShow ? 0 : 1} AND ends_at > ${at - NO_SHOW_DAYS * DAY}`)
    .expect(1, { code: 'spaces.booking.no-show-closed', reason: `A no-show can be marked only within ${NO_SHOW_DAYS} days of the booking, and only once.`, remedy: 'Reload it.' })
  history(unit, booking.id, noShow ? 'no-show-set' : 'no-show-cleared', actor, at)
  unit.announce('spaces.booking.no-show', { bookingId: booking.id, bookableId: booking.bookableId, set: noShow }, { record: ['spaces.booking', booking.id] })
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
