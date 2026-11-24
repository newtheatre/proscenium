// Series (spec part 3, rules R1 to R8 and A7): expanded when made, every occurrence checked under the
// same rules as one booking, saved whole or not at all, cancelled later or all, decided at once.
import { sql } from 'drizzle-orm'
import { all, can, first, newId, nowMs, refuse, theatreTimeZone, useSetting, type Actor, type UnitView } from '#kit'
import { instantOfLocal, localParts } from '#kit/clock'
import { seriesDates } from '../shared/series'
import { bookableFree, CLASH, requireBookable } from './bookings'
import { bookingEvents } from './db/schema'
import type { SeriesInput } from './inputs'
import { checkRequest, type Rule } from './rules'

const MINUTE = 60_000 // not-policy: unit of time
const HHMM = 5 // not-policy: the length of "19:00"

export interface Occurrence {
  date: string
  startsAt: number | null
  endsAt: number | null
  outcome: 'confirm' | 'request' | 'refused'
  rule: Rule | 'R3' | null
  code: string | null
  reason: string | null
}

type SeriesAsk = Omit<SeriesInput, 'title' | 'notes' | 'attendees' | 'leaveOut'> & { leaveOut?: string[] }

/** R2 to R5: every date the series falls on, each with what would happen to it. Writes nothing. */
export async function checkSeries(actor: Actor, input: SeriesAsk): Promise<{ occurrences: Occurrence[], needsDecision: boolean }> {
  const purpose = await first<{ may_repeat: number }>('SELECT may_repeat FROM spaces_purposes WHERE id = ?', input.purposeId)
  if (!purpose) refuse('spaces.request.unknown-purpose', 'There is no such purpose.', { status: 422 })
  if (!purpose.may_repeat) refuse('spaces.series.no-repeat', 'Bookings for this purpose cannot repeat.', { status: 422, remedy: 'Book each date on its own.' })
  const max = await useSetting('spaces.series.max-occurrences') as number
  const dates = seriesDates({ frequency: input.frequency, first: input.firstDate, last: input.lastDate, weekdays: input.weekdays }, max + 1)
  if (dates.length > max) refuse('spaces.series.too-many', `A series has at most ${max} dates.`, { status: 422, remedy: 'Choose an earlier last date.' })
  if (!dates.length) refuse('spaces.series.empty', 'The series falls on no dates.', { status: 422, remedy: 'Check the first and last dates and the days.' })

  const zone = await theatreTimeZone()
  const length = input.lengthMinutes * MINUTE
  const occurrences: Occurrence[] = []
  let previous: number | null = null
  for (const date of dates) {
    const startsAt = instantOfLocal(date, input.startsLocal, zone)
    const p = localParts(startsAt, zone)
    // R3: a time the clocks skip that day is refused for that day alone.
    if (`${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}` !== input.startsLocal.slice(0, HHMM)) {
      occurrences.push({ date, startsAt: null, endsAt: null, outcome: 'refused', rule: 'R3', code: 'spaces.series.no-such-time', reason: `${input.startsLocal} does not exist on that day, when the clocks go forward.` })
      continue
    }
    if (previous !== null && startsAt < previous + length) refuse('spaces.series.overlaps-itself', 'Each date of the series would overlap the next.', { status: 422, remedy: 'Make each booking shorter, or repeat less often.' })
    previous = startsAt
    const verdict = await checkRequest(actor, { ...input, startsAt, endsAt: startsAt + length })
    occurrences.push({ date, startsAt, endsAt: startsAt + length, outcome: verdict.outcome, rule: verdict.rule ?? null, code: verdict.code ?? null, reason: verdict.reason ?? null })
  }
  return { occurrences, needsDecision: occurrences.some(o => o.outcome === 'request') }
}

/**
 * R1 and R4: makes the series and every date not left out in one unit. All must pass the check; the
 * occurrences are one insert read from one parameter, each carrying the clash predicate, and the
 * guard after it refuses the whole unit unless every one was written. A series needing a decision
 * for any date is sent for one as a whole (A7).
 */
export async function createSeries(unit: UnitView, actor: Actor, input: SeriesInput): Promise<{ seriesId: string, state: 'confirmed' | 'requested', occurrences: number }> {
  const { occurrences } = await checkSeries(actor, input)
  const skip = new Set(input.leaveOut)
  const kept = occurrences.filter(o => !skip.has(o.date))
  if (kept.some(o => o.outcome === 'refused'))
    refuse('spaces.series.clashes', 'Some dates cannot be booked.', { status: 409, remedy: 'Leave them out, or change the time.' }) // not-policy: HTTP status
  if (!kept.length) refuse('spaces.series.empty', 'Every date has been left out.', { status: 422 })
  const bookable = await requireBookable(input.bookableId)
  const state = kept.some(o => o.outcome === 'request') ? 'requested' : 'confirmed'
  const who = input.bookedFor ?? actor.accountId!
  const at = nowMs()
  const seriesId = newId('bks')
  unit.add(sql`INSERT INTO spaces_booking_series (id, bookable_id, purpose_id, booked_for, frequency, weekdays, starts_local, length_minutes, first_date, last_date, state, created_at, updated_at)
    VALUES (${seriesId}, ${bookable.id}, ${input.purposeId}, ${who}, ${input.frequency}, ${input.weekdays?.length ? JSON.stringify(input.weekdays) : null}, ${input.startsLocal}, ${input.lengthMinutes},
      ${kept[0]!.date}, ${kept[kept.length - 1]!.date}, 'active', ${at}, ${at})`)
  const rows = kept.map(o => ({ id: newId('bkg'), s: o.startsAt!, e: o.endsAt! }))
  const guard = state === 'confirmed' ? bookableFree(bookable, sql`j.s`, sql`j.e`) : sql`1`
  unit.add(sql`INSERT INTO spaces_bookings (id, bookable_id, purpose_id, tier, series_id, starts_at, ends_at, state, booked_for, requested_by, production_id,
      title, notes, attendees, bumps, late_cancel, no_show, created_at, updated_at)
    SELECT j.id, ${bookable.id}, p.id, p.tier, ${seriesId}, j.s, j.e, ${state}, ${who}, ${actor.accountId!}, ${input.productionId ?? null},
      ${input.title}, ${input.notes ?? null}, ${input.attendees ?? null}, 0, 0, 0, ${at}, ${at}
    FROM (SELECT json_extract(value, '$.id') AS id, json_extract(value, '$.s') AS s, json_extract(value, '$.e') AS e FROM json_each(${JSON.stringify(rows)})) j
    JOIN spaces_purposes p ON p.id = ${input.purposeId} WHERE ${guard}`).expect(rows.length, CLASH)
  unit.insertSet(bookingEvents, rows.map(r => ({ bookingId: r.id, kind: state, actor: actor.accountId ?? null, at })))
  unit.announce(`spaces.booking.${state}`, rows.map(r => ({
    payload: { bookingId: r.id, bookableId: bookable.id, startsAt: r.s, endsAt: r.e, seriesId, ...(state === 'confirmed' ? { decided: false } : {}) },
    record: ['spaces.booking', r.id] as const,
  })))
  if (who !== actor.accountId) unit.audit({ action: 'create', record: ['spaces.booking', rows[0]!.id], ability: 'spaces.booking.manage', detail: { onBehalf: true, occurrences: rows.length } })
  return { seriesId, state, occurrences: rows.length }
}

interface SeriesRow { id: string, bookable_id: string, booked_for: string, state: string }

async function requireSeries(id: string): Promise<SeriesRow> {
  const row = await first<SeriesRow>('SELECT id, bookable_id, booked_for, state FROM spaces_booking_series WHERE id = ?', id)
  if (!row) refuse('spaces.series.not-found', 'There is no such series.', { status: 404 })
  return row
}

/**
 * R6 and R7: cancels the occurrences that have not started, from one of them on or all of them. A
 * request is withdrawn rather than cancelled. Cancelling all ends the series. Set-wise, as the sweep.
 */
export async function cancelSeries(unit: UnitView, actor: Actor, id: string, fromId: string | null): Promise<{ cancelled: number }> {
  const series = await requireSeries(id)
  const own = series.booked_for === actor.accountId
  if (!own && !(await can(actor, 'spaces.booking.manage', ['spaces.bookable', series.bookable_id])).allowed) refuse('core.access.denied', 'This is not your series.', { status: 403 })
  const at = nowMs()
  const from = fromId ? (await first<{ starts_at: number }>('SELECT starts_at FROM spaces_bookings WHERE id = ? AND series_id = ?', fromId, id))?.starts_at : at
  if (from === undefined) refuse('spaces.series.not-in-series', 'That booking is not part of this series.', { status: 422 })
  const reason = own ? 'by-booker' : 'by-staff'
  let n = 0
  for (const [was, to] of [['confirmed', 'cancelled'], ['requested', 'withdrawn']] as const) {
    const rows = await all<{ id: string }>('SELECT id FROM spaces_bookings WHERE series_id = ? AND state = ? AND starts_at > ? AND starts_at >= ? ORDER BY starts_at', id, was, at, from)
    if (!rows.length) continue
    n += rows.length
    const ids = JSON.stringify(rows.map(r => r.id))
    unit.add(sql`UPDATE spaces_bookings SET state = ${to}, closed_reason = ${reason}, updated_at = ${at} WHERE id IN (SELECT value FROM json_each(${ids})) AND state = ${was} AND starts_at > ${at}`)
      .expect(rows.length, { code: 'spaces.series.moved', reason: 'A date of the series changed just now.', remedy: 'Reload it.' })
    unit.insertSet(bookingEvents, rows.map(r => ({ bookingId: r.id, kind: to, actor: actor.accountId ?? null, at })))
    unit.announce(`spaces.booking.${to}`, rows.map(r => ({
      payload: { bookingId: r.id, bookableId: series.bookable_id, ...(to === 'cancelled' ? { reason, late: false } : {}) },
      record: ['spaces.booking', r.id] as const,
    })))
  }
  if (!fromId || !(await first('SELECT 1 FROM spaces_bookings WHERE series_id = ? AND state IN (\'confirmed\', \'requested\') AND starts_at < ? LIMIT 1', id, from)))
    unit.add(sql`UPDATE spaces_booking_series SET state = 'ended', updated_at = ${at} WHERE id = ${id}`)
  return { cancelled: n }
}

/** The occurrences still waiting, refused unless the decider may decide them (A2: never their own). */
async function waitingOf(actor: Actor, id: string): Promise<{ series: SeriesRow, ids: string[] }> {
  const series = await requireSeries(id)
  const rows = await all<{ id: string }>('SELECT id FROM spaces_bookings WHERE series_id = ? AND state = \'requested\' AND starts_at > ? ORDER BY starts_at', id, nowMs())
  if (!rows.length) refuse('spaces.booking.decided', 'Nothing in this series is waiting for a decision.', { status: 409 })
  if (!(await can(actor, 'spaces.booking.decide', ['spaces.booking', rows[0]!.id])).allowed) refuse('core.access.denied', 'You may not decide this series.', { status: 403 })
  return { series, ids: rows.map(r => r.id) }
}

/** A7: confirms every waiting occurrence at once, each carrying the clash predicate; one taken refuses all. */
export async function confirmSeries(unit: UnitView, actor: Actor, id: string, note: string | null): Promise<{ confirmed: number, bookedFor: string }> {
  const { series, ids } = await waitingOf(actor, id)
  const bookable = await requireBookable(series.bookable_id)
  const at = nowMs()
  const list = JSON.stringify(ids)
  unit.add(sql`UPDATE spaces_bookings SET state = 'confirmed', decided_by = ${actor.accountId!}, decided_at = ${at}, decision_note = ${note}, updated_at = ${at}
      WHERE id IN (SELECT value FROM json_each(${list})) AND state = 'requested'
        AND ${bookableFree(bookable, sql`spaces_bookings.starts_at`, sql`spaces_bookings.ends_at`, sql`spaces_bookings.id`)}`)
    .expect(ids.length, { ...CLASH, remedy: 'Decide the dates one by one.' })
  const times = await all<{ id: string, starts_at: number, ends_at: number }>('SELECT id, starts_at, ends_at FROM spaces_bookings WHERE id IN (SELECT value FROM json_each(?))', list)
  unit.insertSet(bookingEvents, ids.map(b => ({ bookingId: b, kind: 'confirmed', actor: actor.accountId ?? null, at, note })))
  unit.announce('spaces.booking.confirmed', times.map(r => ({
    payload: { bookingId: r.id, bookableId: bookable.id, startsAt: r.starts_at, endsAt: r.ends_at, seriesId: id, decided: true },
    record: ['spaces.booking', r.id] as const,
  })))
  return { confirmed: ids.length, bookedFor: series.booked_for }
}

/** A7: declines every waiting occurrence at once, with a note the booker is sent. */
export async function declineSeries(unit: UnitView, actor: Actor, id: string, note: string | null): Promise<{ declined: number, bookedFor: string }> {
  if (!note?.trim()) refuse('spaces.booking.note-needed', 'Say why, so the booker knows.', { status: 422 })
  const { series, ids } = await waitingOf(actor, id)
  const at = nowMs()
  const list = JSON.stringify(ids)
  unit.add(sql`UPDATE spaces_bookings SET state = 'declined', decided_by = ${actor.accountId!}, decided_at = ${at}, decision_note = ${note.trim()}, updated_at = ${at}
      WHERE id IN (SELECT value FROM json_each(${list})) AND state = 'requested'`)
    .expect(ids.length, { code: 'spaces.series.moved', reason: 'A date of the series changed just now.', remedy: 'Reload it.' })
  unit.insertSet(bookingEvents, ids.map(b => ({ bookingId: b, kind: 'declined', actor: actor.accountId ?? null, at, note: note.trim() })))
  unit.announce('spaces.booking.declined', ids.map(b => ({ payload: { bookingId: b, bookableId: series.bookable_id }, record: ['spaces.booking', b] as const })))
  unit.add(sql`UPDATE spaces_booking_series SET state = 'ended', updated_at = ${at} WHERE id = ${id}`)
  return { declined: ids.length, bookedFor: series.booked_for }
}
