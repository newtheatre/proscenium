// Deciding requests (spec part 3, rules A2 to A7 and E2): the queue a person may decide, confirming
// and declining with the booker told, and recording an outside owner's answer for an external room.
import { sql } from 'drizzle-orm'
import { all, can, first, inAccountScope, nowMs, refuse, useDb, useSetting, wordsFrom, type Actor, type UnitView } from '#kit'
import { accountLabel, holdersOf, notify } from '#modules/core'
import { blockersOf, confirmRequest, getBooking, history, moveBooking, requireBookable, requireBooking, type Booking } from './bookings'
import { bumpForRequest } from './bumping'
import { releaseReplaced } from './changes'
import { listBookables } from './setup'
import { assertNoUse } from './uses'
import { bookingWords } from './words'
import catalogue from '../i18n/en-GB.json'

const say = wordsFrom(catalogue)

const SECOND = 1000 // not-policy: settings are whole seconds
const DAY = 86_400_000 // not-policy: unit of time
const RECORD_DAYS = 90 // not-policy: rule A3's window for the booker's record

export interface QueueRow {
  id: string
  bookableId: string
  bookableName: string
  external: boolean
  startsAt: number
  endsAt: number
  title: string
  notes: string | null
  attendees: number | null
  purpose: string
  tier: number
  productionTitle: string | null
  bookedFor: string
  bookedForName: string
  requestedAt: number
  asked: boolean
  urgent: boolean
  seriesId: string | null
  /** X3: confirming it moves a booking the person already has. */
  replaces: boolean
  /** C5: the bookings confirming it would bump, as they stand now. */
  bumps: { title: string, bookedForName: string, startsAt: number, endsAt: number }[]
  /** Other requests for an overlapping time in the same room. */
  clashes: number
  /** For a request that is the viewer's own: listed, never decidable (A2). */
  own: boolean
  /** The booker's no-shows and late cancellations in the last 90 days (A3). */
  record: { noShows: number, lateCancels: number }
}

interface QueueSql {
  id: string
  bookable_id: string
  starts_at: number
  ends_at: number
  title: string
  notes: string | null
  attendees: number | null
  purpose: string
  tier: number
  production_title: string | null
  booked_for: string
  created_at: number
  series_id: string | null
  replaces_id: string | null
  bumps: number
  asked: number
  clashes: number
}

/** Every request the person may decide, and their own, soonest start first (SP-25). */
export async function decisionQueue(actor: Actor): Promise<QueueRow[]> {
  const at = nowMs()
  const urgentWithin = (await useSetting('spaces.requests.remind-after') as number) * SECOND
  const rows = await all<QueueSql>(
    `SELECT b.id, b.bookable_id, b.starts_at, b.ends_at, b.title, b.notes, b.attendees, p.name AS purpose, b.tier, pr.title AS production_title, b.booked_for, b.created_at, b.series_id, b.replaces_id, b.bumps,
        EXISTS (SELECT 1 FROM spaces_booking_events e WHERE e.booking_id = b.id AND e.kind = 'external-placed') AS asked,
        (SELECT count(*) FROM spaces_bookings o WHERE o.bookable_id = b.bookable_id AND o.state = 'requested' AND o.id <> b.id AND o.starts_at < b.ends_at AND o.ends_at > b.starts_at) AS clashes
       FROM spaces_bookings b JOIN spaces_purposes p ON p.id = b.purpose_id LEFT JOIN core_productions pr ON pr.id = b.production_id
      WHERE b.state = 'requested' AND b.starts_at > ? ORDER BY b.starts_at, b.id`, at)
  const bookables = new Map((await listBookables()).map(b => [b.id, b]))
  const out: QueueRow[] = []
  const names = new Map<string, string>()
  const records = new Map<string, QueueRow['record']>()
  for (const r of rows) {
    const own = r.booked_for === actor.accountId
    if (!own && !(await can(actor, 'spaces.booking.decide', ['spaces.booking', r.id])).allowed) continue
    if (own && !(await can(actor, 'spaces.booking.decide', ['spaces.bookable', r.bookable_id])).allowed) continue
    if (!names.has(r.booked_for)) names.set(r.booked_for, await accountLabel(r.booked_for))
    if (!records.has(r.booked_for)) records.set(r.booked_for, await bookerRecord(r.booked_for, at))
    const bookable = bookables.get(r.bookable_id)
    out.push({
      id: r.id,
      bookableId: r.bookable_id,
      bookableName: bookable?.name ?? '',
      external: bookable?.control === 'external',
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      title: r.title,
      notes: r.notes,
      attendees: r.attendees,
      purpose: r.purpose,
      tier: r.tier,
      productionTitle: r.production_title,
      bookedFor: r.booked_for,
      bookedForName: names.get(r.booked_for)!,
      requestedAt: r.created_at,
      asked: !!r.asked,
      urgent: r.starts_at - at < urgentWithin,
      seriesId: r.series_id,
      replaces: !!r.replaces_id,
      bumps: r.bumps ? await inTheWay(r, names) : [],
      clashes: r.clashes,
      own,
      record: records.get(r.booked_for)!,
    })
  }
  return out
}

async function inTheWay(r: QueueSql, names: Map<string, string>): Promise<QueueRow['bumps']> {
  const blockers = (await blockersOf(await requireBookable(r.bookable_id), r.starts_at, r.ends_at, r.replaces_id)).filter(b => b.kind === 'booking')
  const out: QueueRow['bumps'] = []
  for (const b of blockers) {
    if (!names.has(b.bookedFor!)) names.set(b.bookedFor!, await accountLabel(b.bookedFor!))
    const title = (await first<{ title: string }>('SELECT title FROM spaces_bookings WHERE id = ?', b.id))?.title ?? ''
    out.push({ title, bookedForName: names.get(b.bookedFor!)!, startsAt: b.startsAt, endsAt: b.endsAt })
  }
  return out
}

async function bookerRecord(accountId: string, at: number): Promise<QueueRow['record']> {
  const [row] = await useDb().all<{ no_shows: number | null, late: number | null }>(sql`SELECT sum(no_show) AS no_shows, sum(late_cancel) AS late FROM spaces_bookings
    WHERE ${inAccountScope('booked_for', accountId)} AND starts_at > ${at - RECORD_DAYS * DAY} AND starts_at <= ${at}`)
  return { noShows: row?.no_shows ?? 0, lateCancels: row?.late ?? 0 }
}

/** The request, refused unless it is still waiting for a decision. */
async function waiting(id: string): Promise<Booking> {
  const booking = await requireBooking(id)
  if (booking.state !== 'requested') refuse('spaces.booking.decided', 'This request has already been decided.', { status: 409, remedy: 'Reload the list.' })
  return booking
}

/**
 * A4 and E2: confirms a request. The move carries the clash predicate again; an external room's
 * answer needs the owner's reference.
 */
export async function decideConfirm(unit: UnitView, id: string, decider: string, input: { note: string | null, reference: string | null, overrideReason?: string | null, actor?: Actor }): Promise<Booking> {
  const booking = await waiting(id)
  const bookable = await requireBookable(booking.bookableId)
  const reference = input.reference?.trim() || null
  if (bookable.control === 'external' && !reference) refuse('spaces.booking.reference-needed', 'Give the owner\'s reference for this booking.', { status: 422 })
  await assertNoUse(bookable.spaceId, booking.startsAt, booking.endsAt)
  if (booking.bumps) await bumpForRequest(unit, booking, bookable, input.actor ?? { kind: 'person', accountId: decider }, input.overrideReason ?? null)
  releaseReplaced(unit, booking, booking.replacesId ? await getBooking(booking.replacesId) : null, decider)
  confirmRequest(unit, booking, bookable, decider, input.note?.trim() || null)
  if (reference) unit.add(sql`UPDATE spaces_bookings SET external_ref = ${reference} WHERE id = ${booking.id}`)
  await tellBooker(unit, booking, 'confirmed', input.note)
  return booking
}

/** A4: declines a request with a note, which the booker is sent. */
export async function decideDecline(unit: UnitView, id: string, decider: string, note: string | null): Promise<Booking> {
  if (!note?.trim()) refuse('spaces.booking.note-needed', 'Say why, so the booker knows.', { status: 422 })
  const booking = await waiting(id)
  const at = nowMs()
  moveBooking(unit, booking, {
    to: 'declined',
    actor: decider,
    note: note.trim(),
    set: sql`decided_by = ${decider}, decided_at = ${at}, decision_note = ${note.trim()}`,
  })
  await tellBooker(unit, booking, 'declined', note)
  return booking
}

/** E2: the request has been put to the room's outside owner. Recorded once; the booker sees "asked". */
export async function markPlaced(unit: UnitView, id: string, decider: string): Promise<void> {
  const booking = await waiting(id)
  const bookable = await requireBookable(booking.bookableId)
  if (bookable.control !== 'external') refuse('spaces.booking.not-external', 'Only a request for a room booked elsewhere is asked of its owner.', { status: 409 })
  const at = nowMs()
  unit.add(sql`UPDATE spaces_bookings SET updated_at = ${at} WHERE id = ${booking.id} AND state = 'requested'
      AND NOT EXISTS (SELECT 1 FROM spaces_booking_events WHERE booking_id = ${booking.id} AND kind = 'external-placed')`)
    .expect(1, { code: 'spaces.booking.already-asked', reason: 'The owner has already been asked.' })
  history(unit, booking.id, 'external-placed', decider, at)
}

async function tellBooker(unit: UnitView, booking: Booking, outcome: 'confirmed' | 'declined', note: string | null): Promise<void> {
  await notify(unit, `spaces.request-${outcome}`, {
    to: booking.bookedFor,
    variables: { ...await bookingWords(booking.id), note: note?.trim() || say('spaces.words.no-note') },
    dedupeKey: `decided:${booking.id}`,
    subject: ['spaces.booking', booking.id],
  })
}

/** A5: the people who may decide a new request are told of it, never the booker themselves. */
export async function tellApprovers(unit: UnitView, bookingId: string): Promise<void> {
  const booking = await requireBooking(bookingId)
  // A series is one request (A7): only its first date tells anyone.
  if (booking.seriesId && await first('SELECT 1 FROM spaces_bookings WHERE series_id = ? AND starts_at < ? LIMIT 1', booking.seriesId, booking.startsAt)) return
  const to = (await holdersOf('spaces.booking.decide', ['spaces.booking', bookingId])).filter(a => a !== booking.bookedFor)
  if (!to.length) return
  await notify(unit, 'spaces.request-new', { to, variables: await bookingWords(bookingId), dedupeKey: `request:${bookingId}`, subject: ['spaces.booking', bookingId] })
}

/** SP-13: who may decide requests in a room and manage its bookings, and how many may book it. */
export async function peopleOf(bookableId: string): Promise<{ decide: { id: string, name: string }[], manage: { id: string, name: string }[], request: number }> {
  await requireBookable(bookableId)
  const named = async (ids: string[]) => Promise.all(ids.map(async id => ({ id, name: await accountLabel(id) })))
  const record = ['spaces.bookable', bookableId] as const
  return {
    decide: await named(await holdersOf('spaces.booking.decide', record)),
    manage: await named(await holdersOf('spaces.booking.manage', record)),
    request: (await holdersOf('spaces.booking.request', record)).length,
  }
}
