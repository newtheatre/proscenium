// Bringing in bookings from another system, for a theatre that moves here part-way through a
// season. Each booking in the file becomes an order as if it had been made here: an unpaid one is a
// reservation, with its seats taken and its release time set, and one with nothing to pay is
// confirmed with its tickets issued. The booking keeps its reference, so it can still be read out
// at the desk, and may bring the text of the code its buyer already holds, which is stored as the
// order's desk code so the door and the till find the order when it is scanned.
//
// Nothing is sent to the buyer: they have the other system's message already. A booking is known
// by its reference, so a file may be imported again: one already here is left alone, or released
// if the file now says it was cancelled. Each booking is a unit of its own, so one that is refused
// (no room, an unknown performance) never holds back the rest.
//
// A ticket of a type with requirements is named for the buyer with nothing kept to check again,
// exactly as one a seller checked by hand: the other system made its own check, or none.
import { sql } from 'drizzle-orm'
import { all, createUnit, first, newId, nowMs, useSetting, type UnitView } from '#kit'
import { findOrCreateAccount } from '#modules/core'
import { claimSeats } from './capacity'
import { hashOf } from './codes'
import { holds, orderLines } from './db/schema'
import { bookingSchema, type ImportBooking } from '../shared/import-booking'
import { poolsOf, salesOf } from './setup'
import { listTicketTypes } from './ticket-types'
import { issueTickets } from './tickets'

export const MOST_BOOKINGS = 2000 // not-policy: a season's bookings, and a request body D1 can carry
export const BOOKINGS_PER_JOB = 10 // not-policy: each booking is a handful of statements; a job stays well inside a Worker's limits
const BASKET_FOR = 60_000 // not-policy: the order is a basket only inside its own batch

export { bookingSchema, type ImportBooking }

export type ImportVerdict
  = | { reference: string, result: 'import', state: 'reserved' | 'confirmed', tickets: number, totalMinor: number }
    | { reference: string, result: 'already' | 'release' | 'left-out' }
    | { reference: string, result: 'refused', reason: string }

interface Planned {
  performanceId: string
  startsAt: number
  lines: { poolId: string, bandId: string, ticketTypeId: string, amountMinor: number, named: boolean }[]
  totalMinor: number
}

type Types = Awaited<ReturnType<typeof listTicketTypes>>

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** Where a booking's tickets would go, or why it cannot be brought in. Reads only. */
async function plan(booking: ImportBooking, types: Types): Promise<Planned | string> {
  const performance = await first<{ id: string, starts_at: number, state: string }>(
    `SELECT f.id, f.starts_at, f.state FROM core_performances f JOIN core_productions p ON p.id = f.production_id
      WHERE p.slug = ? AND f.starts_at = ?`, booking.production, booking.startsAt)
  if (!performance) return `No performance of "${booking.production}" starts at ${new Date(booking.startsAt).toISOString()}.`
  if (performance.state !== 'scheduled') return 'The performance is not scheduled.'
  if (!await salesOf(performance.id)) return 'The performance is not set up for sale.'
  const pools = await poolsOf(performance.id)
  const lines: Planned['lines'] = []
  for (const ticket of booking.tickets) {
    const type = types.find(t => same(t.name, ticket.type))
    if (!type) return `There is no ticket type named "${ticket.type}".`
    const wanted = ticket.band ? pools.filter(p => same(p.bandName, ticket.band!)) : pools.filter(p => p.bandKind === 'standard')
    if (wanted.length !== 1) return ticket.band ? `The performance has no part of the house named "${ticket.band}".` : 'The performance has more than one part of the house, so each ticket must name its own.'
    lines.push({ poolId: wanted[0]!.id, bandId: wanted[0]!.bandId, ticketTypeId: type.id, amountMinor: ticket.amountMinor, named: type.requirementRefs.length > 0 })
  }
  return { performanceId: performance.id, startsAt: performance.starts_at, lines, totalMinor: lines.reduce((sum, l) => sum + l.amountMinor, 0) }
}

const existing = (reference: string) => first<{ id: string, state: string }>('SELECT id, state FROM box_office_orders WHERE reference = ?', reference.toUpperCase())

/** What importing each booking would do, with nothing written. Room is judged only when it is taken. */
export async function checkBookings(bookings: readonly ImportBooking[]): Promise<ImportVerdict[]> {
  const types = await listTicketTypes()
  const seen = new Set<string>()
  const out: ImportVerdict[] = []
  for (const booking of bookings) {
    const reference = booking.reference.toUpperCase()
    if (seen.has(reference)) {
      out.push({ reference, result: 'refused', reason: 'The file holds this reference twice.' })
      continue
    }
    seen.add(reference)
    out.push(await verdictFor(booking, types))
  }
  return out
}

async function verdictFor(booking: ImportBooking, types: Types): Promise<ImportVerdict> {
  const reference = booking.reference.toUpperCase()
  const order = await existing(reference)
  if (order) return { reference, result: booking.cancelled && order.state === 'reserved' ? 'release' : 'already' }
  if (booking.cancelled) return { reference, result: 'left-out' }
  const planned = await plan(booking, types)
  if (typeof planned === 'string') return { reference, result: 'refused', reason: planned }
  return { reference, result: 'import', state: planned.totalMinor === 0 ? 'confirmed' : 'reserved', tickets: planned.lines.length, totalMinor: planned.totalMinor }
}

/** Releases an imported reservation the other system has since cancelled. The buyer is not written to. */
function release(unit: UnitView, orderId: string, importId: string): void {
  const at = nowMs()
  const not = { code: 'box-office.order.not-reserved', reason: 'This order is not a reservation waiting to be paid for.' }
  unit.add(sql`UPDATE box_office_orders SET state = 'expired', release_at = NULL, updated_at = ${at} WHERE id = ${orderId} AND state = 'reserved'`).expect(1, not)
  unit.add(sql`UPDATE box_office_claims SET state = 'released', released_at = ${at}, release_reason = 'staff'
    WHERE state = 'confirmed' AND hold_id IN (SELECT id FROM box_office_holds WHERE order_id = ${orderId})`)
  unit.announce('box-office.order.expired', { orderId }, { record: ['box-office.order', orderId] })
  unit.audit({ action: 'release', record: ['box-office.order', orderId], detail: { importId } })
}

/** Adds one booking to the unit as an order of this site. */
async function write(unit: UnitView, booking: ImportBooking, planned: Planned, importId: string): Promise<'reserved' | 'confirmed'> {
  const at = nowMs()
  const reference = booking.reference.toUpperCase()
  const made = booking.createdAt ?? at
  const { accountId } = await findOrCreateAccount(unit, { address: booking.email, name: booking.name ?? null, origin: 'guest' })
  const currency = await useSetting('core.locale.currency') as string
  const releaseBefore = await useSetting('box-office.reservations.release-before') as number | null
  const releaseAt = releaseBefore === null ? null : planned.startsAt - releaseBefore * 1000 // not-policy: seconds to milliseconds
  const state = planned.totalMinor === 0 ? 'confirmed' : 'reserved'
  const orderId = newId('ord')
  // The code is hashed as the door and the till hash what they scan: upper-cased.
  const deskCodeHash = booking.code ? await hashOf(booking.code.toUpperCase()) : null

  // An order starts as a basket and is reserved or confirmed in the same batch, as one made here is.
  unit.add({
    sql: "INSERT INTO box_office_orders (id, reference, channel, state, signed_in, currency, total_minor, expires_at, keep, created_at, updated_at) VALUES (?, ?, 'online', 'basket', 0, ?, ?, ?, 0, ?, ?)",
    params: [orderId, reference, currency, planned.totalMinor, at + BASKET_FOR, made, at],
  })
  const [holdId] = unit.insertSet(holds, [{ kind: state === 'reserved' ? 'reservation' : 'basket', orderId }])
  const byPool = new Map<string, number>()
  for (const line of planned.lines) byPool.set(line.poolId, (byPool.get(line.poolId) ?? 0) + 1)
  const requests = [...byPool].map(([poolId, quantity]) => ({ poolId, quantity }))
  const claimed = await claimSeats(unit, { holdId: holdId!, requests, state: 'confirmed', expiresAt: null })
  const claimsOf = new Map(requests.map((r, i) => [r.poolId, [...claimed[i]!]]))
  const lineIds = unit.insertSet(orderLines, planned.lines.map(l => ({
    orderId, kind: 'ticket', performanceId: planned.performanceId, bandId: l.bandId, ticketTypeId: l.ticketTypeId, claimId: claimsOf.get(l.poolId)!.shift()!,
    listMinor: l.amountMinor, discountMinor: 0, amountMinor: l.amountMinor, state: 'live', requirementAccountId: l.named ? accountId : null,
  })))
  unit.expect(planned.lines.length)
  if (state === 'reserved') {
    unit.add(sql`UPDATE box_office_orders SET state = 'reserved', account_id = ${accountId}, desk_code_hash = ${deskCodeHash}, expires_at = NULL, release_at = ${releaseAt}, reserved_at = ${made}
      WHERE id = ${orderId} AND state = 'basket'`).expect(1)
    unit.announce('box-office.order.reserved', { orderId, performanceIds: [planned.performanceId] }, { record: ['box-office.order', orderId] })
  }
  else {
    unit.add(sql`UPDATE box_office_orders SET state = 'confirmed', account_id = ${accountId}, desk_code_hash = ${deskCodeHash}, expires_at = NULL, confirmed_at = ${made}
      WHERE id = ${orderId} AND state = 'basket'`).expect(1)
    await issueTickets(unit, lineIds.map(id => ({ id, performance_id: planned.performanceId })))
    unit.announce('box-office.order.confirmed', { orderId, performanceIds: [planned.performanceId] }, { record: ['box-office.order', orderId] })
  }
  unit.audit({ action: 'create', record: ['box-office.order', orderId], detail: { importId, reference } })
  return state
}

export interface ImportJob { importId: string, bookings: ImportBooking[] }

/** One share of an import. Each booking is checked again and written in a unit of its own. */
export async function importShare(payload: ImportJob): Promise<ImportVerdict[]> {
  const types = await listTicketTypes()
  const out: ImportVerdict[] = []
  for (const booking of payload.bookings) {
    const verdict = await verdictFor(booking, types)
    if (verdict.result !== 'import' && verdict.result !== 'release') {
      out.push(verdict)
      continue
    }
    try {
      const unit = createUnit()
      if (verdict.result === 'release') {
        release(unit.view(), (await existing(verdict.reference))!.id, payload.importId)
      }
      else {
        const planned = await plan(booking, types) as Planned
        await write(unit.view(), booking, planned, payload.importId)
      }
      await unit.commit()
      out.push(verdict)
    }
    catch (error: any) {
      // A refusal (no room left, an address that cannot be an account) is this booking's alone.
      if (error?.name !== 'Refusal') throw error
      out.push({ reference: verdict.reference, result: 'refused', reason: error.reason ?? error.code })
    }
  }
  return out
}

/** What became of an import: its orders, and how many tickets each performance now holds from it. */
export async function importSummary(importId: string): Promise<{ orders: number, performances: { performanceId: string, orders: number, tickets: number }[] }> {
  const rows = await all<{ performance_id: string, orders: number, tickets: number }>(
    `SELECT l.performance_id, count(DISTINCT l.order_id) AS orders, count(*) AS tickets FROM box_office_order_lines l
      WHERE l.kind = 'ticket' AND l.state = 'live' AND l.order_id IN (
        SELECT a.record_id FROM core_audit a WHERE a.record_type = 'box-office.order' AND a.action = 'create' AND json_extract(a.detail, '$.importId') = ?)
      GROUP BY l.performance_id`, importId)
  return { orders: rows.reduce((sum, r) => sum + r.orders, 0), performances: rows.map(r => ({ performanceId: r.performance_id, orders: r.orders, tickets: r.tickets })) }
}
