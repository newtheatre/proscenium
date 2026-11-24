// Priority bumping by request (spec part 3, rules B1 to B3, B5 and C5): a request may ask for a time
// held only by bookings of a lower tier that may be bumped, and confirming it moves them aside in the
// same unit. A performance, a closure or an equal tier is never bumped by a request.
import { sql } from 'drizzle-orm'
import { can, nowMs, refuse, useSetting, wordsFrom, type Actor, type UnitView } from '#kit'
import { notify } from '#modules/core'
import { blockersOf, type Bookable, type Blocker, type Booking } from './bookings'
import { bookingEvents } from './db/schema'
import { bookingWords } from './words'
import catalogue from '../i18n/en-GB.json'

const say = wordsFrom(catalogue)
const SECOND = 1000 // not-policy: settings are whole seconds

/** 'ok' when every blocker may be bumped; 'notice' when only the notice stands in the way (B3); else 'no'. */
export type BumpVerdict = 'ok' | 'notice' | 'no'

/** Rules B1 and B5 over what is in the way, for a request of `tier` at `at`. */
export async function bumpVerdict(blockers: Blocker[], tier: number, at: number): Promise<{ verdict: BumpVerdict, noticeMinutes: number }> {
  const notice = (await useSetting('spaces.bumping.notice') as number) * SECOND
  const noticeMinutes = Math.round(notice / 60_000) // not-policy: milliseconds to minutes
  if (!blockers.length || !(await useSetting('spaces.bumping.enabled'))) return { verdict: 'no', noticeMinutes }
  const lower = blockers.every(b => b.kind === 'booking' && b.tier !== undefined && b.tier > tier && b.canBeBumped)
  if (!lower) return { verdict: 'no', noticeMinutes }
  return { verdict: blockers.every(b => b.startsAt - at >= notice) ? 'ok' : 'notice', noticeMinutes }
}

/**
 * B2 and B3 at the decision: the bookings in the way of a request that bumps are moved to Bumped with
 * reason higher-tier, before the request is confirmed in the same unit. If anything in the way can
 * no longer be bumped, nothing is written and the decider is told why.
 */
export async function bumpForRequest(unit: UnitView, request: Booking, bookable: Bookable, decider: Actor, overrideReason: string | null): Promise<number> {
  const at = nowMs()
  const blockers = await blockersOf(bookable, request.startsAt, request.endsAt, request.replacesId)
  if (!blockers.length) return 0
  const { verdict } = await bumpVerdict(blockers, request.tier, at)
  if (verdict === 'no')
    refuse('spaces.bump.not-now', 'Something in the way can no longer be moved aside.', { status: 409, remedy: 'Decline the request, or ask the booker for another time.' })
  const overriding = verdict === 'notice'
  if (overriding) {
    const allowed = !!overrideReason?.trim() && (await can(decider, 'spaces.booking.override', ['spaces.bookable', bookable.id])).allowed
    if (!allowed) refuse('spaces.bump.notice', 'A booking in the way now starts too soon to be moved aside.', { status: 409, remedy: 'Decline the request, or give a reason to override if you may.' })
  }
  // The same bookings, by predicate: a booking confirmed or changed since the read refuses the whole unit.
  unit.add(sql`UPDATE spaces_bookings SET state = 'bumped', closed_reason = 'higher-tier', bumped_by_id = ${request.id}, updated_at = ${at}
    WHERE bookable_id = ${bookable.id} AND state = 'confirmed' AND starts_at < ${request.endsAt} AND ends_at > ${request.startsAt}
      AND id IS NOT ${request.replacesId} AND tier > ${request.tier}
      AND purpose_id IN (SELECT id FROM spaces_purposes WHERE can_be_bumped = 1)`)
    .expect(blockers.length, { code: 'spaces.booking.changed', reason: 'A booking in the way changed just now.', remedy: 'Try again.' })
  unit.insertSet(bookingEvents, blockers.map(b => ({ bookingId: b.id, kind: 'bumped', actor: decider.accountId ?? null, at, note: null, detail: JSON.stringify({ reason: 'higher-tier' }) })))
  unit.announce('spaces.booking.bumped', blockers.map(b => ({
    payload: { bookingId: b.id, bookableId: bookable.id, reason: 'higher-tier', bumpedById: request.id },
    record: ['spaces.booking', b.id] as const,
  })))
  if (overriding) {
    unit.add(sql`UPDATE spaces_bookings SET override_reason = coalesce(override_reason, ${overrideReason!.trim()}) WHERE id = ${request.id}`)
    unit.audit({ action: 'update', record: ['spaces.booking', request.id], ability: 'spaces.booking.override', detail: { bumpedInsideNotice: blockers.length } })
  }
  const note = say('spaces.displace.note.higher-tier')
  const contact = (await useSetting('spaces.bumping.contact') as string | null) || say('spaces.displace.contact')
  const to = []
  for (const b of blockers) to.push({ accountId: b.bookedFor!, variables: { ...await bookingWords(b.id), note, contact }, dedupeKey: `displaced:${b.id}` })
  await notify(unit, 'spaces.booking-bumped', { to })
  return blockers.length
}
