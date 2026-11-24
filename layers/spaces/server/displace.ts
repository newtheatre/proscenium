// When other things change (part 3, rules L1, L2 and L4, and "Many bookings at once"): the bookings
// in the way of a performance, a closure or a removed room are moved aside set-wise. One update per
// state, one insert of history rows, one set of events and one set of messages, however many there
// are; past the set limit the soonest are done and spaces.clear-window repeats for the rest.
import { sql, type SQL } from 'drizzle-orm'
import { nowMs, useDb, useSetting, wordsFrom, type UnitView } from '#kit'
import { closureSpaces, notify } from '#modules/core'
import { bookingEvents } from './db/schema'
import { bookingWords } from './words'
import catalogue from '../i18n/en-GB.json'

const say = wordsFrom(catalogue)

export type Displacement
  = | { reason: 'performance', performanceId: string }
    | { reason: 'closure', closureId: string }
    | { reason: 'bookable-removed', spaceId?: string, venueId?: string }

/** The bookings a displacement reaches, as a predicate on spaces_bookings b: never a list of ids read beforehand. */
function reach(d: Displacement): SQL {
  if (d.reason === 'performance') {
    return sql`b.bookable_id IN (SELECT k.id FROM spaces_bookables k JOIN core_performances f ON f.space_id = k.space_id WHERE f.id = ${d.performanceId} AND k.kind = 'space')
      AND EXISTS (SELECT 1 FROM core_performances f WHERE f.id = ${d.performanceId} AND f.state = 'scheduled' AND f.starts_at < b.ends_at AND f.ends_at > b.starts_at)`
  }
  if (d.reason === 'closure') {
    // C1: a space's bookable within the closure's spaces; a resource kept at its venue, or anywhere for the whole theatre's.
    return sql`EXISTS (SELECT 1 FROM core_closures c WHERE c.id = ${d.closureId} AND c.kind = 'closure' AND c.blocks_performances = 1 AND c.starts_at < b.ends_at AND c.ends_at > b.starts_at)
      AND b.bookable_id IN (SELECT k.id FROM spaces_bookables k WHERE (k.kind = 'space' AND k.space_id IN (${closureSpaces(d.closureId)}))
        OR (k.kind = 'resource' AND EXISTS (SELECT 1 FROM core_closures c WHERE c.id = ${d.closureId} AND (c.venue_id IS NULL OR (c.space_id IS NULL AND c.venue_id = k.home_venue_id)))))`
  }
  return d.spaceId
    ? sql`b.bookable_id IN (SELECT id FROM spaces_bookables WHERE space_id = ${d.spaceId})`
    : sql`b.bookable_id IN (SELECT id FROM spaces_bookables WHERE space_id IN (SELECT id FROM core_spaces WHERE venue_id = ${d.venueId!}))`
}

interface Row { id: string, bookable_id: string, state: 'confirmed' | 'requested', booked_for: string }

/** How many bookings and requests ahead a displacement would reach, for core.change-impact. */
export async function displacedCount(where: SQL): Promise<{ bookings: number, requests: number }> {
  const [r] = await useDb().all<{ bookings: number, requests: number }>(sql`SELECT
      coalesce(sum(b.state = 'confirmed'), 0) AS bookings, coalesce(sum(b.state = 'requested'), 0) AS requests
    FROM spaces_bookings b WHERE b.state IN ('confirmed', 'requested') AND b.starts_at > ${nowMs()} AND ${where}`)
  return r ?? { bookings: 0, requests: 0 }
}

/**
 * L1, L2 and L4 in the caller's unit. Confirmed bookings ahead become Bumped (L1, L2) or Cancelled
 * (L4) with the reason; requests ahead are Declined with a standard note. Each booker is told once.
 * Returns how many were changed and whether more are left for spaces.clear-window.
 */
export async function displace(unit: UnitView, d: Displacement): Promise<{ changed: number, more: boolean }> {
  const at = nowMs()
  const limit = await useSetting('core.units.set-rows-limit') as number
  const found = await useDb().all<Row>(sql`SELECT b.id, b.bookable_id, b.state, b.booked_for FROM spaces_bookings b
    WHERE b.state IN ('confirmed', 'requested') AND b.starts_at > ${at} AND ${reach(d)} ORDER BY b.starts_at, b.id LIMIT ${limit + 1}`)
  const more = found.length > limit
  const rows = found.slice(0, limit)
  if (!rows.length) return { changed: 0, more: false }
  const removed = d.reason === 'bookable-removed'
  const note = say(`spaces.displace.note.${d.reason}`)
  const words = new Map<string, Awaited<ReturnType<typeof bookingWords>>>()
  for (const r of rows) words.set(r.id, await bookingWords(r.id))

  for (const was of ['confirmed', 'requested'] as const) {
    const these = rows.filter(r => r.state === was)
    if (!these.length) continue
    const to = was === 'requested' ? 'declined' : removed ? 'cancelled' : 'bumped'
    const ids = JSON.stringify(these.map(r => r.id))
    const decided = to === 'declined' ? sql`, decided_at = ${at}, decision_note = ${note}` : sql`, closed_reason = ${d.reason}`
    unit.add(sql`UPDATE spaces_bookings SET state = ${to}, updated_at = ${at}${decided}
      WHERE id IN (SELECT value FROM json_each(${ids})) AND state = ${was} AND starts_at > ${at}`)
      .expect(these.length, { code: 'spaces.booking.changed', reason: 'A booking in the way changed just now.', remedy: 'Try again.' })
    unit.insertSet(bookingEvents, these.map(r => ({ bookingId: r.id, kind: to, actor: null, at, note: to === 'declined' ? note : null, detail: to === 'declined' ? null : JSON.stringify({ reason: d.reason }) })))
    unit.announce(`spaces.booking.${to}`, these.map(r => ({
      payload: { bookingId: r.id, bookableId: r.bookable_id, ...(to === 'cancelled' ? { reason: d.reason, late: false } : to === 'bumped' ? { reason: d.reason, bumpedById: null } : {}) },
      record: ['spaces.booking', r.id] as const,
    })))
    const type = to === 'declined' ? 'spaces.request-declined' : to === 'bumped' ? 'spaces.booking-bumped' : 'spaces.booking-cancelled'
    const contact = (await useSetting('spaces.bumping.contact') as string | null) || say('spaces.displace.contact')
    await notify(unit, type, {
      to: these.map(r => ({ accountId: r.booked_for, variables: { ...words.get(r.id)!, note, ...(to === 'bumped' ? { contact } : {}) }, dedupeKey: `displaced:${r.id}` })),
    })
  }
  return { changed: rows.length, more }
}
