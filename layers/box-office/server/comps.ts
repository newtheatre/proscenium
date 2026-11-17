// Complimentary tickets (Box office specification, part 4, "Complimentary tickets"; BO-62, BO-63).
// Someone with `box-office.comp.request` on a performance asks for a number of tickets in one band,
// for a named person and a reason from the theatre's list. Approving issues them in the same batch:
// a confirmed order of zero-price tickets on the theatre's complimentary ticket type, sent to the
// person, scanned and counted like any other ticket. Nobody decides their own request: the ability
// refuses the owner and a CHECK refuses the row.
import { sql, type SQL } from 'drizzle-orm'
import { first, inAccountScope, newId, nowMs, refuse, useContext, useDb, useSetting, type UnitView } from '#kit'
import { findOrCreateAccount, getPerformance, getTerm } from '#modules/core'
import { claimSeats } from './capacity'
import { newReference } from './codes'
import { confirmOrder, type Confirmed } from './confirm'
import { orderLines } from './db/schema'
import type { LineRow, OrderRow } from './orders'
import { pricesFor } from './prices'
import { poolsOf } from './setup'
import { ensureManagedTicketTypes, managedType } from './ticket-types'

const REASONS = 'box-office.comp-reason'
const HOLD = 60_000 // not-policy: the batch confirms the order it opens; the expiry only has to be in the future
const CHANGED = { code: 'box-office.comp.changed', reason: 'This request has just been decided or withdrawn.', remedy: 'Reload to see where it stands.' }

export type CompState = 'requested' | 'approved' | 'declined' | 'issued' | 'withdrawn'

export interface CompRow {
  id: string
  performance_id: string
  band_id: string
  quantity: number
  for_account_id: string
  reason_term_id: string
  requested_by: string
  state: CompState
  decided_by: string | null
  decided_at: number | null
  order_id: string | null
  created_at: number
}

export interface CompRequestInput {
  performanceId: string
  bandId: string
  quantity: number
  /** Who the tickets are for. An address nobody holds makes an unclaimed account for them. */
  email: string
  name?: string | null
  reasonTermId: string
}

const COMP = 'SELECT id, performance_id, band_id, quantity, for_account_id, reason_term_id, requested_by, state, decided_by, decided_at, order_id, created_at FROM box_office_comp_requests'

export function compById(id: string): Promise<CompRow | null> {
  return first<CompRow>(`${COMP} WHERE id = ?`, id)
}

/** Requests matching a condition, newest first, a page's worth. */
export function compsWhere(where: SQL): Promise<CompRow[]> {
  return useDb().all<CompRow>(sql`${sql.raw(COMP)} WHERE ${where} ORDER BY created_at DESC LIMIT 200`) // not-policy: a page's worth
}

/** Adds a request to the unit and says its id. */
export async function requestComps(unit: UnitView, input: CompRequestInput): Promise<{ requestId: string }> {
  const actor = useContext().actor
  if (!actor.accountId) refuse('box-office.comp.signed-out', 'Sign in to ask for complimentary tickets.', { status: 401 })
  const performance = await getPerformance(input.performanceId)
  if (performance.state === 'cancelled') refuse('box-office.comp.cancelled', 'This performance is cancelled.', { status: 409 })
  if (!(await poolsOf(input.performanceId)).some(p => p.bandId === input.bandId))
    refuse('box-office.comp.bad-band', 'That band is not on sale for this performance.', { status: 422, fields: { bandId: 'invalid' } })
  const most = await useSetting('box-office.comps.per-request') as number
  if (input.quantity > most) refuse('box-office.comp.too-many', `At most ${most} complimentary tickets in one request.`, { status: 422, fields: { quantity: 'too-many' }, remedy: 'Ask for fewer, or make a second request.' })
  const term = await getTerm(input.reasonTermId)
  if (!term || term.vocabularyKey !== REASONS || term.retired)
    refuse('box-office.comp.bad-reason', 'That reason is not on the list of reasons for complimentary tickets.', { status: 422, fields: { reasonTermId: 'invalid' }, remedy: 'Choose a reason from the list.' })

  const { accountId } = await findOrCreateAccount(unit, { address: input.email, name: input.name, origin: 'named-by-other' })
  const at = nowMs()
  const requestId = newId('comp')
  unit.add(sql`INSERT INTO box_office_comp_requests (id, performance_id, band_id, quantity, for_account_id, reason_term_id, requested_by, state, created_at, updated_at)
    VALUES (${requestId}, ${input.performanceId}, ${input.bandId}, ${input.quantity}, ${accountId}, ${input.reasonTermId}, ${actor.accountId}, 'requested', ${at}, ${at})`)
  unit.announce('box-office.comp-request.requested', { requestId }, { record: ['box-office.comp-request', requestId] })
  return { requestId }
}

/**
 * Approves a request and issues its tickets in the same batch. The performance's approved total stays
 * within `box-office.comps.per-performance`, checked by the statement that approves, so two approvals
 * at once cannot pass the cap between them.
 */
export async function approveComps(unit: UnitView, requestId: string): Promise<Confirmed> {
  const actor = useContext().actor
  const request = await compById(requestId)
  if (!request) refuse('box-office.comp.not-found', 'There is no such request.', { status: 404 })
  if (request.state !== 'requested') refuse(CHANGED.code, CHANGED.reason, { status: 409, remedy: CHANGED.remedy })
  // Box office keeps its own Complimentary type; it is made here if this site has not listed its types yet.
  await ensureManagedTicketTypes()
  const type = await managedType('box-office.complimentary')
  if (!type) refuse('box-office.comp.no-type', 'The Complimentary ticket type has been retired, so there is nothing to issue them on.', { status: 409, remedy: 'Bring it back on the Ticket types screen.' })
  const pool = (await poolsOf(request.performance_id)).find(p => p.bandId === request.band_id)
  if (!pool) refuse('box-office.comp.bad-band', 'That band is no longer on sale for this performance.', { status: 409 })
  const cap = await useSetting('box-office.comps.per-performance') as number | null
  const at = nowMs()
  // Nothing is charged: the currency is the performance's, for the order's money columns.
  const currency = (await pricesFor(request.performance_id, at))[0]?.currency ?? 'GBP'
  const over = { code: 'box-office.comp.over-cap', reason: `Approving these would take this performance past its ${cap ?? 0} complimentary tickets.`, remedy: 'Decline it, or raise the limit in the box office settings.' }
  unit.add(sql`UPDATE box_office_comp_requests SET state = 'approved', decided_by = ${actor.accountId ?? null}, decided_at = ${at}, updated_at = ${at}
    WHERE id = ${requestId} AND state = 'requested'
      AND (${cap} IS NULL OR quantity + (SELECT coalesce(sum(quantity), 0) FROM box_office_comp_requests
        WHERE performance_id = ${request.performance_id} AND state IN ('approved', 'issued') AND id <> ${requestId}) <= ${cap})`).expect(1, cap === null ? CHANGED : over)

  const orderId = newId('ord')
  const holdId = newId('hold')
  const order: OrderRow = {
    id: orderId, reference: newReference(), state: 'basket', account_id: request.for_account_id, currency, total_minor: 0, expires_at: at + HOLD,
    release_at: null, intent_id: null, confirm_email: null, confirm_name: null, admit_on_payment: 0, sold_by: actor.accountId ?? null,
  }
  unit.add(sql`INSERT INTO box_office_orders (id, reference, channel, state, account_id, signed_in, currency, total_minor, sold_by, expires_at, keep, created_at, updated_at)
    VALUES (${orderId}, ${order.reference}, 'desk', 'basket', ${request.for_account_id}, 0, ${currency}, 0, ${order.sold_by}, ${order.expires_at}, 0, ${at}, ${at})`)
  unit.add(sql`INSERT INTO box_office_holds (id, kind, order_id, held_by, created_at, updated_at) VALUES (${holdId}, 'basket', ${orderId}, ${actor.accountId ?? null}, ${at}, ${at})`)
  const claimed = (await claimSeats(unit, { holdId, requests: [{ poolId: pool.id, quantity: request.quantity }], expiresAt: order.expires_at })).flat()
  const lineIds = unit.insertSet(orderLines, claimed.map(claimId => ({
    orderId, kind: 'ticket', performanceId: request.performance_id, bandId: request.band_id, ticketTypeId: type.id, claimId, listMinor: 0, discountMinor: 0, amountMinor: 0, compRequestId: requestId, state: 'live',
  })))
  unit.expect(claimed.length)
  const lines: LineRow[] = lineIds.map(id => ({ id, performance_id: request.performance_id, band_id: request.band_id, ticket_type_id: type.id, amount_minor: 0, type_name: type.name, type_kind: 'complimentary', band_name: null }))
  const confirmed = await confirmOrder(unit, order, lines, { from: 'basket', account: { id: request.for_account_id, signedIn: false } })
  unit.add(sql`UPDATE box_office_comp_requests SET state = 'issued', order_id = ${orderId}, updated_at = ${at} WHERE id = ${requestId} AND state = 'approved'`).expect(1, CHANGED)
  unit.announce('box-office.comp-request.decided', { requestId, state: 'issued' }, { record: ['box-office.comp-request', requestId] })
  return confirmed
}

/** Declines a request (by an approver) or withdraws it (by the requester). */
export async function closeComps(unit: UnitView, request: CompRow, as: 'declined' | 'withdrawn'): Promise<void> {
  const actor = useContext().actor
  if (request.state !== 'requested') refuse(CHANGED.code, CHANGED.reason, { status: 409, remedy: CHANGED.remedy })
  const at = nowMs()
  if (as === 'withdrawn') {
    const own = actor.accountId ? await useDb().get(sql`SELECT 1 AS one FROM box_office_comp_requests WHERE id = ${request.id} AND ${inAccountScope('requested_by', actor.accountId)}`) : null
    if (!own) refuse('box-office.comp.not-yours', 'Only the person who asked can withdraw a request.', { status: 403 })
    unit.add(sql`UPDATE box_office_comp_requests SET state = 'withdrawn', updated_at = ${at} WHERE id = ${request.id} AND state = 'requested'`).expect(1, CHANGED)
  }
  else {
    unit.add(sql`UPDATE box_office_comp_requests SET state = 'declined', decided_by = ${actor.accountId ?? null}, decided_at = ${at}, updated_at = ${at}
      WHERE id = ${request.id} AND state = 'requested'`).expect(1, CHANGED)
  }
  unit.announce('box-office.comp-request.decided', { requestId: request.id, state: as }, { record: ['box-office.comp-request', request.id] })
}
