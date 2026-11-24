// What a person may see of room bookings (spec part 3, "Who sees what"): the calendar (K1 to K3),
// their own bookings, and one booking. Nothing here is public (K4).
import { sql } from 'drizzle-orm'
import { all, can, first, inAccountScope, refuse, useDb, useSetting, type Actor } from '#kit'
import { accountLabel, closuresBetween, listPerformances } from '#modules/core'
import type { BookingState } from '../shared/states'
import { listBookables, type BookableRow } from './setup'
import { usesOf } from './uses'

const DAY = 86_400_000 // not-policy: unit of time
export const CALENDAR_DAYS = 31 // not-policy: the widest window the calendar asks for (part 4, routes)

export interface Shown {
  bookableId: string
  calendar: boolean
  request: boolean
  /** Sees everyone's bookings in full, and other people's requests (K2, K3). */
  staff: boolean
  manage: boolean
  override: boolean
}

/** The bookables this person may see the calendar of, and what else they may do in each. */
export async function bookablesFor(actor: Actor): Promise<(BookableRow & { may: Shown })[]> {
  const out: (BookableRow & { may: Shown })[] = []
  for (const b of await listBookables()) {
    if (b.state === 'archived') continue
    const record = ['spaces.bookable', b.id] as const
    if (!(await can(actor, 'spaces.calendar.view', record)).allowed) continue
    const [request, staff, manage, override] = await Promise.all([
      can(actor, 'spaces.booking.request', record),
      can(actor, 'spaces.booking.view', record),
      can(actor, 'spaces.booking.manage', record),
      can(actor, 'spaces.booking.override', record),
    ])
    out.push({ ...b, may: { bookableId: b.id, calendar: true, request: request.allowed, staff: staff.allowed, manage: manage.allowed, override: override.allowed } })
  }
  return out
}

export interface CalendarItem {
  kind: 'booking' | 'request' | 'performance' | 'closure' | 'holiday' | 'use'
  id: string
  bookableId: string | null
  startsAt: number
  endsAt: number
  /** What K2 lets this viewer read: the purpose, the title, the booker. Absent is "Booked". */
  purpose?: string
  title?: string
  bookedBy?: string
  mine: boolean
  state?: BookingState
}

/** Bookings, performances and closures in a window for the bookables asked for, shaped by rule K2. */
export async function calendarFor(actor: Actor, input: { bookableIds: string[], from: number, to: number }): Promise<{ bookables: (BookableRow & { may: Shown })[], items: CalendarItem[] }> {
  if (input.to <= input.from || input.to - input.from > CALENDAR_DAYS * DAY)
    refuse('spaces.calendar.window', `The calendar shows at most ${CALENDAR_DAYS} days at once.`, { status: 422 })
  const visible = await bookablesFor(actor)
  const chosen = input.bookableIds.length ? visible.filter(b => input.bookableIds.includes(b.id)) : visible
  if (!chosen.length) return { bookables: visible, items: [] }
  const details = await useSetting('spaces.calendar.show-details') as 'full' | 'purpose' | 'busy'
  const me = actor.accountId ?? null
  const staffOf = new Map(chosen.map(b => [b.id, b.may.staff]))

  const rows = await all<{ id: string, bookable_id: string, starts_at: number, ends_at: number, state: BookingState, booked_for: string, title: string, purpose: string }>(
    `SELECT b.id, b.bookable_id, b.starts_at, b.ends_at, b.state, b.booked_for, b.title, p.name AS purpose
       FROM spaces_bookings b JOIN spaces_purposes p ON p.id = b.purpose_id
      WHERE b.bookable_id IN (SELECT value FROM json_each(?)) AND b.state IN ('confirmed', 'requested') AND b.starts_at < ? AND b.ends_at > ?
      ORDER BY b.starts_at, b.id`, JSON.stringify(chosen.map(b => b.id)), input.to, input.from)
  const names = new Map<string, string>()
  const items: CalendarItem[] = []
  for (const r of rows) {
    const mine = r.booked_for === me
    const staff = !!staffOf.get(r.bookable_id)
    // K3: other people's requests are for the people who decide them.
    if (r.state === 'requested' && !mine && !staff) continue
    const full = mine || staff || details === 'full'
    const item: CalendarItem = { kind: r.state === 'requested' ? 'request' : 'booking', id: r.id, bookableId: r.bookable_id, startsAt: r.starts_at, endsAt: r.ends_at, mine, state: r.state }
    if (full || details === 'purpose') item.purpose = r.purpose
    if (full) {
      item.title = r.title
      if (!names.has(r.booked_for)) names.set(r.booked_for, await accountLabel(r.booked_for))
      item.bookedBy = names.get(r.booked_for)
    }
    items.push(item)
  }

  // Performances in the spaces chosen, and closures of their venues or the whole theatre (C1).
  const titles = new Map<string, string>()
  for (const b of chosen) {
    if (b.kind === 'space' && b.spaceId) {
      for (const p of await listPerformances({ spaceId: b.spaceId, state: 'scheduled', from: input.from, to: input.to })) {
        if (!titles.has(p.productionId)) titles.set(p.productionId, (await first<{ title: string }>('SELECT title FROM core_productions WHERE id = ?', p.productionId))?.title ?? '')
        items.push({ kind: 'performance', id: p.id, bookableId: b.id, startsAt: p.startsAt, endsAt: p.endsAt, title: titles.get(p.productionId), mine: false })
      }
    }
  }
  // C1a: other modules' uses of the spaces chosen, named only where the reporting module allows.
  const spaceIds = [...new Set(chosen.flatMap(b => b.kind === 'space' && b.spaceId ? [b.spaceId] : []))]
  for (const u of await usesOf(spaceIds, input.from, input.to, actor)) {
    for (const b of chosen) {
      if (b.kind === 'space' && b.spaceId === u.spaceId) items.push({ kind: 'use', id: u.record.id, bookableId: b.id, startsAt: u.from, endsAt: u.to, ...(u.label ? { title: u.label } : {}), mine: false })
    }
  }
  const closures = await closuresBetween(input.from, input.to)
  for (const c of closures) {
    if (c.kind !== 'closure') {
      items.push({ kind: 'holiday', id: c.id, bookableId: null, startsAt: c.startsAt, endsAt: c.endsAt, title: c.title, mine: false })
      continue
    }
    if (!c.blocksPerformances) continue
    for (const b of chosen) {
      const covers = c.venueId === null || (c.spaceId === null && c.venueId === b.venueId) || (b.kind === 'space' && c.spaceId === b.spaceId)
      if (covers) items.push({ kind: 'closure', id: c.id, bookableId: b.id, startsAt: c.startsAt, endsAt: c.endsAt, title: c.title, mine: false })
    }
  }
  return { bookables: visible, items: items.sort((a, b) => a.startsAt - b.startsAt) }
}

export interface BookingView {
  id: string
  bookableId: string
  bookableName: string
  purposeId: string
  purpose: string
  tier: number
  state: BookingState
  startsAt: number
  endsAt: number
  title: string
  notes: string | null
  attendees: number | null
  productionId: string | null
  productionTitle: string | null
  bookedFor: string
  bookedForName: string
  seriesId: string | null
  origin: { type: string, id: string } | null
  decisionNote: string | null
  closedReason: string | null
  lateCancel: boolean
  overrideReason: string | null
  noShow: boolean
  /** X3: the request that would move this booking, while it waits; or the booking a request would move. */
  change: { id: string, bookableName: string, startsAt: number, endsAt: number } | null
  replaces: { id: string, bookableName: string, startsAt: number, endsAt: number } | null
  history: { kind: string, at: number, note: string | null, byBooker: boolean }[]
}

/** One booking in full: for its owner, or a holder of spaces.booking.view (the route checks which). */
export async function bookingView(id: string): Promise<BookingView> {
  const r = await first<any>(`SELECT b.*, p.name AS purpose, pr.title AS production_title FROM spaces_bookings b
      JOIN spaces_purposes p ON p.id = b.purpose_id LEFT JOIN core_productions pr ON pr.id = b.production_id WHERE b.id = ?`, id)
  if (!r) refuse('spaces.booking.not-found', 'There is no such room booking.', { status: 404 })
  const bookable = (await listBookables()).find(b => b.id === r.bookable_id)
  const history = await all<{ kind: string, at: number, note: string | null, actor: string | null }>('SELECT kind, at, note, actor FROM spaces_booking_events WHERE booking_id = ? ORDER BY at, id', id)
  const names = new Map((await listBookables()).map(b => [b.id, b.name]))
  const brief = (x: { id: string, bookable_id: string, starts_at: number, ends_at: number } | null) => x ? { id: x.id, bookableName: names.get(x.bookable_id) ?? '', startsAt: x.starts_at, endsAt: x.ends_at } : null
  const change = await first<{ id: string, bookable_id: string, starts_at: number, ends_at: number }>('SELECT id, bookable_id, starts_at, ends_at FROM spaces_bookings WHERE replaces_id = ? AND state = \'requested\' ORDER BY created_at DESC LIMIT 1', id)
  const replaces = r.replaces_id ? await first<{ id: string, bookable_id: string, starts_at: number, ends_at: number }>('SELECT id, bookable_id, starts_at, ends_at FROM spaces_bookings WHERE id = ?', r.replaces_id) : null
  return {
    id: r.id,
    bookableId: r.bookable_id,
    bookableName: bookable?.name ?? '',
    purposeId: r.purpose_id,
    purpose: r.purpose,
    tier: r.tier,
    state: r.state,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    title: r.title,
    notes: r.notes,
    attendees: r.attendees,
    productionId: r.production_id,
    productionTitle: r.production_title,
    bookedFor: r.booked_for,
    bookedForName: await accountLabel(r.booked_for),
    seriesId: r.series_id,
    origin: r.origin_type ? { type: r.origin_type, id: r.origin_id } : null,
    decisionNote: r.decision_note,
    closedReason: r.closed_reason,
    lateCancel: !!r.late_cancel,
    overrideReason: r.override_reason,
    noShow: !!r.no_show,
    change: brief(change),
    replaces: brief(replaces),
    history: history.map(h => ({ kind: h.kind, at: h.at, note: h.note, byBooker: h.actor === r.booked_for })),
  }
}

/** A person's own bookings: upcoming and requests first, then the past, newest first. */
export async function myBookings(accountId: string, now: number): Promise<{ upcoming: BookingSummary[], requests: BookingSummary[], past: BookingSummary[] }> {
  const rows = await useDb().all<any>(sql`SELECT b.id, b.bookable_id, b.starts_at, b.ends_at, b.state, b.title, b.series_id, p.name AS purpose
      FROM spaces_bookings b JOIN spaces_purposes p ON p.id = b.purpose_id WHERE ${inAccountScope('b.booked_for', accountId)} ORDER BY b.starts_at`)
  const names = new Map((await listBookables()).map(b => [b.id, b.name]))
  const all_ = rows.map((r): BookingSummary => ({ id: r.id, bookableId: r.bookable_id, bookableName: names.get(r.bookable_id) ?? '', startsAt: r.starts_at, endsAt: r.ends_at, state: r.state, title: r.title, purpose: r.purpose, seriesId: r.series_id }))
  return {
    upcoming: all_.filter(b => b.state === 'confirmed' && b.endsAt > now),
    requests: all_.filter(b => b.state === 'requested'),
    past: all_.filter(b => !(b.state === 'confirmed' && b.endsAt > now) && b.state !== 'requested').reverse(),
  }
}

export interface BookingSummary { id: string, bookableId: string, bookableName: string, startsAt: number, endsAt: number, state: BookingState, title: string, purpose: string, seriesId: string | null }
