// Asking for a room (spec part 3, "Asking for a booking"): rules P1 to P9, the blockers of C1 and
// the decision of A1, run in that order so the first failure is the one reported. `checkRequest`
// writes nothing and is what the form calls as a person types; `requestBooking` runs the same
// checks and then the write that cannot double-book.
import { sql } from 'drizzle-orm'
import { all, can, fact, first, inAccountScope, nowMs, refuse, requirements, theatreTimeZone, useDb, useSetting, type Actor, type UnitView } from '#kit'
import { localParts } from '#kit/clock'
import { blockersOf, insertBooking, requireBookable, type Bookable, type Blocker } from './bookings'
import { clockMinutes } from '../shared/setup'

const MINUTE = 60_000 // not-policy: unit of time
const HOUR_MINUTES = 60 // not-policy: unit of time
const WEEK_DAYS = 7 // not-policy: unit of time
const DAY = 86_400_000 // not-policy: unit of time
const SECOND = 1000 // not-policy: settings are whole seconds

export interface AskInput {
  bookableId: string
  purposeId: string
  startsAt: number
  endsAt: number
  productionId?: string | null
  /** Who the booking is for; another member only for a holder of spaces.booking.manage (P11). */
  bookedFor?: string | null
  /** Given by a holder of spaces.booking.override, it passes P5 to P9 (P10). */
  overrideReason?: string | null
  /** X2: the booking being moved, whose own time is not in the way. */
  replaces?: string | null
}

export type Rule = 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'P7' | 'P8' | 'P9' | 'C1'

export interface Verdict {
  outcome: 'confirm' | 'request' | 'refused'
  rule?: Rule
  code?: string
  reason?: string
  remedy?: string
  /** The rule's figure, for the screen to word: a length, a number of days, a time. */
  figure?: Record<string, number | string>
  external: boolean
  blockers: Blocker[]
  nearest?: { startsAt: number, endsAt: number }
  /** Other people's requests for an overlapping time (K3): a count and nothing more. */
  waiting: number
  /** Rules set aside by an override, with the reason stored on the booking. */
  overridden: Rule[]
}

interface PurposeHere {
  id: string
  tier: number
  open_to: 'bookers' | 'production-team' | 'staff'
  needs_production: number
  approval: 'automatic' | 'approval'
  here_allowed: number | null
  here_approval: 'automatic' | 'approval' | null
  max_length_minutes: number | null
  max_ahead_days: number | null
  min_notice_minutes: number | null
  requirements: string
  state: string
}

interface BookableRules extends Bookable { approval: 'by-purpose' | 'always', always_open: number, max_length_minutes: number | null, requirements: string }

const asPerson = (accountId: string): Actor => ({ kind: 'person', accountId })

/** The opening spans of a bookable by weekday (1 Monday to 7 Sunday), in minutes past midnight. */
async function spansOf(bookableId: string): Promise<Map<number, [number, number][]>> {
  const rows = await all<{ weekday: number, opens_at: string, closes_at: string }>('SELECT weekday, opens_at, closes_at FROM spaces_opening_hours WHERE bookable_id = ? ORDER BY weekday, opens_at', bookableId)
  const spans = new Map<number, [number, number][]>()
  for (const r of rows) spans.set(r.weekday, [...spans.get(r.weekday) ?? [], [clockMinutes(r.opens_at), clockMinutes(r.closes_at)]])
  return spans
}

/** The local day pieces of a window: weekday 1 to 7 and minutes past local midnight, end exclusive. */
function pieces(from: number, to: number, zone: string): { weekday: number, start: number, end: number }[] {
  const out: { weekday: number, start: number, end: number }[] = []
  let at = from
  while (at < to) {
    const p = localParts(at, zone)
    const start = p.hour * HOUR_MINUTES + p.minute
    const left = (24 * 60 - start) * MINUTE // not-policy: minutes in a day
    const until = Math.min(to, at + left)
    out.push({ weekday: p.weekday === 0 ? WEEK_DAYS : p.weekday, start, end: start + Math.round((until - at) / MINUTE) })
    at = until
  }
  return out
}

/** Rule P8: every local piece of the window sits inside one opening span of its day. */
export function insideHours(spans: Map<number, [number, number][]>, from: number, to: number, zone: string): boolean {
  return pieces(from, to, zone).every(piece => (spans.get(piece.weekday) ?? []).some(([opens, closes]) => opens <= piece.start && piece.end <= closes))
}

/**
 * The free window of the same length nearest the one asked for, on the same local day, inside
 * opening hours and on slot boundaries (rule C3). Null when the day has none.
 */
export function nearestFree(input: { from: number, to: number, blockers: Blocker[], slotMinutes: number, zone: string, open: (from: number, to: number) => boolean }): { startsAt: number, endsAt: number } | null {
  const length = input.to - input.from
  const local = localParts(input.from, input.zone)
  const dayStart = input.from - ((local.hour * HOUR_MINUTES + local.minute) * MINUTE)
  const step = input.slotMinutes * MINUTE
  let best: { startsAt: number, endsAt: number } | null = null
  for (let start = dayStart; start + length <= dayStart + DAY; start += step) {
    const end = start + length
    if (input.blockers.some(b => b.startsAt < end && start < b.endsAt)) continue
    if (!input.open(start, end)) continue
    if (!best || Math.abs(start - input.from) < Math.abs(best.startsAt - input.from)) best = { startsAt: start, endsAt: end }
  }
  return best && best.startsAt !== input.from ? best : null
}

const refused = (rule: Rule, code: string, reason: string, extra: Partial<Verdict> = {}): Verdict =>
  ({ outcome: 'refused', rule, code, reason, external: false, blockers: [], waiting: 0, overridden: [], ...extra })

/**
 * Runs P1 to C1 and A1 for the actor, without writing. A refusal names its rule; a pass says
 * whether the booking would be confirmed at once or sent for a decision.
 */
export async function checkRequest(actor: Actor, input: AskInput): Promise<Verdict> {
  const bookable = await requireBookable(input.bookableId)
  const record = ['spaces.bookable', bookable.id] as const
  const who = input.bookedFor ?? actor.accountId ?? null
  if (!who) return refused('P1', 'core.access.signed-out', 'You need to sign in to book a room.')

  // P1: may ask here, and the bookable takes bookings. Booking for someone else is P11.
  if (!(await can(actor, 'spaces.booking.request', record)).allowed)
    return refused('P1', 'spaces.request.not-allowed', 'You cannot book this room.')
  if (who !== actor.accountId && !(await can(actor, 'spaces.booking.manage', record)).allowed)
    return refused('P1', 'spaces.request.not-for-others', 'You cannot book a room for someone else.')
  if (bookable.state !== 'active')
    return refused('P1', 'spaces.request.not-taking', bookable.state === 'paused' ? 'This room is not taking new bookings at the moment.' : 'This room can no longer be booked.')

  const rules = (await first<BookableRules>('SELECT id, kind, space_id, home_venue_id, control, state, approval, always_open, max_length_minutes, requirements FROM spaces_bookables WHERE id = ?', bookable.id))!
  const purpose = await first<PurposeHere>(`SELECT p.*, bp.allowed AS here_allowed, bp.approval AS here_approval
    FROM spaces_purposes p LEFT JOIN spaces_bookable_purposes bp ON bp.purpose_id = p.id AND bp.bookable_id = ? WHERE p.id = ?`, bookable.id, input.purposeId)

  // P2: the purpose is open to the person the booking is for.
  if (!purpose) return refused('P3', 'spaces.request.purpose-unknown', 'There is no such purpose.')
  if (purpose.open_to === 'staff' && !(await can(actor, 'spaces.booking.manage', record)).allowed)
    return refused('P2', 'spaces.request.purpose-staff', 'Only staff can book a room for this.')
  if (purpose.needs_production || purpose.open_to === 'production-team') {
    if (!input.productionId) return refused('P2', 'spaces.request.production-needed', 'Choose the production this booking is for.')
    const production = await first('SELECT 1 FROM core_productions WHERE id = ? AND state != \'cancelled\'', input.productionId)
    if (!production) return refused('P2', 'spaces.request.production-unknown', 'There is no such production.')
    if (purpose.open_to === 'production-team' && !(await fact('core.production-team', who === actor.accountId ? actor : asPerson(who), ['core.production', input.productionId])))
      return refused('P2', 'spaces.request.not-on-team', who === actor.accountId ? 'Only the production\'s team can book a room for this.' : 'They are not on this production\'s team.')
  }

  // P3: the purpose is in use and allowed here.
  if (purpose.state !== 'active' || purpose.here_allowed === 0)
    return refused('P3', 'spaces.request.purpose-not-here', 'This room cannot be booked for that.')

  // P4: slot boundaries, end after start, start ahead.
  const zone = await theatreTimeZone()
  const slot = Number(await useSetting('spaces.bookings.slot-size'))
  const onSlot = (at: number) => {
    const p = localParts(at, zone)
    return (p.hour * HOUR_MINUTES + p.minute) % slot === 0 && at % MINUTE === 0
  }
  if (input.endsAt <= input.startsAt) return refused('P4', 'spaces.request.backwards', 'The booking must end after it starts.')
  if (!onSlot(input.startsAt) || !onSlot(input.endsAt)) return refused('P4', 'spaces.request.off-slot', `Bookings start and end on the ${slot}-minute mark.`, { figure: { slot } })
  const now = nowMs()
  if (input.startsAt <= now) return refused('P4', 'spaces.request.past', 'That time has already started.')

  const overriding = !!input.overrideReason?.trim() && (await can(actor, 'spaces.booking.override', record)).allowed
  const overridden: Rule[] = []
  const limit = (rule: Rule, code: string, reason: string, figure: Record<string, number | string>): Verdict | null => {
    if (overriding) {
      overridden.push(rule)
      return null
    }
    return refused(rule, code, reason, { figure })
  }

  // P5 to P7: length, how far ahead, notice. The bookable's own limit, else the purpose's, else the setting.
  const maxLength = (rules.max_length_minutes ?? purpose.max_length_minutes ?? (await useSetting('spaces.bookings.max-length') as number) / 60) * MINUTE // not-policy: seconds to minutes
  if (input.endsAt - input.startsAt > maxLength) {
    const v = limit('P5', 'spaces.request.too-long', 'That is longer than a booking here can be.', { minutes: maxLength / MINUTE })
    if (v) return v
  }
  const maxAhead = purpose.max_ahead_days !== null ? purpose.max_ahead_days * DAY : (await useSetting('spaces.bookings.max-ahead') as number) * SECOND
  if (input.startsAt - now > maxAhead) {
    const v = limit('P6', 'spaces.request.too-far', 'That is further ahead than this can be booked.', { days: Math.round(maxAhead / DAY) })
    if (v) return v
  }
  const notice = purpose.min_notice_minutes !== null ? purpose.min_notice_minutes * MINUTE : (await useSetting('spaces.bookings.min-notice') as number) * SECOND
  if (input.startsAt - now < notice) {
    const v = limit('P7', 'spaces.request.short-notice', 'That is too soon to book.', { minutes: Math.round(notice / MINUTE) })
    if (v) return v
  }

  // P8: inside opening hours.
  const spans = rules.always_open ? null : await spansOf(bookable.id)
  const open = (from: number, to: number) => !spans || insideHours(spans, from, to, zone)
  if (!open(input.startsAt, input.endsAt)) {
    const v = limit('P8', 'spaces.request.closed', 'The room is not open for all of that time.', {})
    if (v) return v
  }

  // P9: requirements of the room and the purpose, for the person, at the booking's start.
  const refs = [...JSON.parse(rules.requirements || '[]') as string[], ...JSON.parse(purpose.requirements || '[]') as string[]]
  if (refs.length) {
    const answers = await requirements.check({ accounts: [who], refs, at: input.startsAt, whenUnavailable: 'met' })
    const unmet = answers.find(a => a.verdict === 'not-met')
    if (unmet) {
      const v = limit('P9', 'spaces.request.requirement', unmet.reason ?? 'A requirement for booking this is not met.', { ref: unmet.ref })
      if (v) return v
    }
  }

  // C1: anything in the way. A1: whether a decision is needed.
  const external = bookable.control === 'external'
  const blockers = await blockersOf(bookable, input.startsAt, input.endsAt, input.replaces ?? null)
  const waiting = (await useDb().all<{ n: number }>(sql`SELECT count(*) AS n FROM spaces_bookings WHERE bookable_id = ${bookable.id} AND state = 'requested'
    AND starts_at < ${input.endsAt} AND ends_at > ${input.startsAt} AND NOT ${inAccountScope('booked_for', who)}`))[0]!.n
  if (blockers.length) {
    const nearest = nearestFree({ from: input.startsAt, to: input.endsAt, blockers: await blockersOf(bookable, input.startsAt - DAY, input.endsAt + DAY, input.replaces ?? null), slotMinutes: slot, zone, open }) ?? undefined
    return refused('C1', 'spaces.clash', 'Something else is booked at that time.', { blockers, nearest, external, waiting, remedy: nearest ? 'Choose the nearest free time.' : 'Choose another day.' })
  }
  const needsDecision = external || rules.approval === 'always' || (purpose.here_approval ?? purpose.approval) === 'approval'
  return { outcome: needsDecision ? 'request' : 'confirm', external, blockers: [], waiting, overridden }
}

export interface RequestInput extends AskInput {
  title: string
  notes?: string | null
  attendees?: number | null
}

/**
 * Makes a booking or a request under every rule, in the caller's unit. A refusal throws with the
 * rule's code. Returns the id and the state it will have once the unit commits.
 */
export async function requestBooking(unit: UnitView, actor: Actor, input: RequestInput): Promise<{ bookingId: string, state: 'confirmed' | 'requested', verdict: Verdict }> {
  const verdict = await checkRequest(actor, input)
  if (verdict.outcome === 'refused') refuse(verdict.code!, verdict.reason!, { status: verdict.code === 'spaces.clash' ? 409 : 422, remedy: verdict.remedy }) // not-policy: HTTP statuses
  const bookable = await requireBookable(input.bookableId)
  const state = verdict.outcome === 'confirm' ? 'confirmed' : 'requested'
  const who = input.bookedFor ?? actor.accountId!
  const bookingId = insertBooking(unit, {
    bookable,
    purposeId: input.purposeId,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    state,
    bookedFor: who,
    requestedBy: actor.accountId!,
    title: input.title,
    notes: input.notes ?? null,
    attendees: input.attendees ?? null,
    productionId: input.productionId ?? null,
    overrideReason: verdict.overridden.length ? input.overrideReason!.trim() : null,
  }, actor.accountId ?? null)
  if (verdict.overridden.length) unit.audit({ action: 'create', record: ['spaces.booking', bookingId], ability: 'spaces.booking.override', detail: { overridden: verdict.overridden.length } })
  if (who !== actor.accountId) unit.audit({ action: 'create', record: ['spaces.booking', bookingId], ability: 'spaces.booking.manage', detail: { onBehalf: true } })
  return { bookingId, state, verdict }
}
