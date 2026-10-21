import { db } from '@nuxthub/db'
import { createError } from 'h3'
import { sql } from 'drizzle-orm'
import { findByEmail, hasNoWayIn, newId } from './accounts'
import { heldSeatsForReservation, passAdmissionTicketInsert } from './capacity'
import { postEntry, runLedgerBatch } from './ledger'
import { passAdmissionAllows } from './pass-redemption'
import { passTypeForSale, passTypePriceById } from './passes'
import { effectiveCapacity } from './performances'
import { performanceById } from './programme'
import { passAdmissionTicketType } from './ticket-types'
import { auditEntry } from '#shared/utils/audit'
import { generatePassReference, passCapReason, passSaleRefusal } from '#shared/utils/passes'
import { generateReservationReference } from '#shared/utils/reservations'
import type { TillPassInput } from '#shared/utils/sale'
import type { BatchItem } from 'drizzle-orm/batch'
import type { SQL } from 'drizzle-orm'

// D-134: a pass sold on the show-night till. The sale's own batch issues it (`tillPassStatements`);
// moving tonight's booking onto it is a second write once the pass exists (`swapBookingOntoPass`).

export interface ResolvedTillPass {
  passId: string
  reference: string
  passTypeId: string
  passTypeName: string
  passTypePriceId: string
  priceLabel: string
  pricePence: number
  maxIssued: number | null
  buyer: { id: string, name: string }
  requestId: string | null
  swap: SwapCandidate | null
  // Why tonight's booking stays as it is, said on the receipt; null when there is none to move.
  keptBooking: string | null
}

export interface SwapCandidate {
  reservationId: string
  reference: string
  performanceId: string
  showId: string
  showTitle: string
}

interface TonightBookingRow {
  reservationId: string
  reference: string
  performanceId: string
  showId: string
  showTitle: string
  liveTickets: number
  covered: number
}

export const NO_ACCOUNT_SAYS = 'Nobody has an account on that email address. A pass needs one: ask them to create an account on their phone, then sell again. Nothing has been charged.'

// One performance at a time, never an `IN` list: the till's own houses tonight, a bounded handful (0006).
export function tonightBookingQuery(userId: string, performanceId: string, passTypeId: string): SQL {
  return sql`
    SELECT r.id AS reservationId, r.reference AS reference, r.performance_id AS performanceId,
           s.id AS showId, s.title AS showTitle,
           ${heldSeatsForReservation(sql`r.id`)} AS liveTickets,
           EXISTS (SELECT 1 FROM pass_type_shows c WHERE c.pass_type_id = ${passTypeId} AND c.show_id = s.id) AS covered
    FROM reservations r
    JOIN performances p ON p.id = r.performance_id
    JOIN shows s ON s.id = p.show_id
    WHERE r.user_id = ${userId} AND r.performance_id = ${performanceId} AND r.status = 'PENDING'
    ORDER BY r.created_at
  `
}

// Only a one-seat, unpaid booking the pass covers moves (D-134 criterion 3): a pass admits one
// person, so a party's booking stays as it is and is collected as usual.
export function swapDecision(rows: TonightBookingRow[]): { swap: SwapCandidate | null, keptBooking: string | null } {
  const covered = rows.filter(row => row.covered === 1)
  const movable = covered.find(row => row.liveTickets === 1)
  if (movable) {
    const { reservationId, reference, performanceId, showId, showTitle } = movable
    return { swap: { reservationId, reference, performanceId, showId, showTitle }, keptBooking: null }
  }
  const party = covered.find(row => row.liveTickets > 1)
  if (party) return { swap: null, keptBooking: `${party.reference} is for ${party.liveTickets} people, so it stays as it is: collect it as usual.` }
  return { swap: null, keptBooking: null }
}

export async function resolveTillPass(input: TillPassInput, performanceIds: string[], now: number): Promise<ResolvedTillPass> {
  const passType = await passTypeForSale(input.passTypeId)
  if (!passType) throw createError({ statusCode: 404, statusMessage: 'That pass no longer exists' })
  const refusal = passSaleRefusal(passType, now)
  if (refusal) throw createError({ statusCode: 409, statusMessage: refusal })

  const price = await passTypePriceById(input.passTypePriceId)
  if (!price || price.passTypeId !== input.passTypeId) {
    throw createError({ statusCode: 400, statusMessage: 'Choose one of the prices this pass offers' })
  }

  // A pass always needs an account (D-133 criterion 3): a guest record from a booking is not one.
  const account = await findByEmail(input.email)
  if (!account || account.anonymisedAt !== null || account.disabled || !account.verified || await hasNoWayIn(account)) {
    throw createError({ statusCode: 409, statusMessage: NO_ACCOUNT_SAYS })
  }

  const [held] = await db.all<{ id: string }>(sql`
    SELECT id AS id FROM passes WHERE user_id = ${account.id} AND pass_type_id = ${input.passTypeId} AND status = 'ACTIVE'
  `)
  if (held) throw createError({ statusCode: 409, statusMessage: `${account.name} already holds this pass. Nothing has been charged.` })

  const [request] = await db.all<{ id: string }>(sql`
    SELECT id AS id FROM pass_requests WHERE user_id = ${account.id} AND pass_type_id = ${input.passTypeId} AND status = 'PENDING'
  `)

  const rows: TonightBookingRow[] = []
  for (const performanceId of performanceIds) {
    rows.push(...await db.all<TonightBookingRow>(tonightBookingQuery(account.id, performanceId, input.passTypeId)))
  }

  return {
    passId: newId(),
    reference: generatePassReference(),
    passTypeId: passType.id,
    passTypeName: passType.name,
    passTypePriceId: price.id,
    priceLabel: price.label,
    pricePence: price.price,
    maxIssued: passType.maxIssued,
    buyer: { id: account.id, name: account.name },
    requestId: request?.id ?? null,
    ...swapDecision(rows),
  }
}

// Issued in the sale's own batch, gated on its entry. Over the cap, 0035's assertion re-inserts
// the pass's own id (as its reference too, so only the key can clash) and the sale rolls back.
export function tillPassSql(pass: ResolvedTillPass, entryId: string, actorId: string): SQL[] {
  const posts = sql`EXISTS (SELECT 1 FROM ledger_entries WHERE id = ${entryId})`
  const columns = sql`id, reference, pass_type_id, pass_type_price_id, user_id, price_paid, status, issued_by`
  const values = sql`${pass.passId}, ${pass.reference}, ${pass.passTypeId}, ${pass.passTypePriceId}, ${pass.buyer.id}, ${pass.pricePence}, 'ACTIVE', ${actorId}`
  const issued = auditEntry({ actorId, action: 'pass.issued', target: `pass:${pass.passId}`, detail: { passTypeId: pass.passTypeId, userId: pass.buyer.id, pricePaid: pass.pricePence } })

  const statements: SQL[] = [
    sql`INSERT INTO passes (${columns}) SELECT ${values} WHERE ${posts}`,
    sql`
      INSERT INTO passes (${columns})
      SELECT ${pass.passId}, ${pass.passId}, ${pass.passTypeId}, ${pass.passTypePriceId}, ${pass.buyer.id}, ${pass.pricePence}, 'ACTIVE', ${actorId}
      WHERE ${pass.maxIssued} IS NOT NULL
        AND (SELECT count(*) FROM passes WHERE pass_type_id = ${pass.passTypeId} AND status != 'CANCELLED') > ${pass.maxIssued}
    `,
    sql`
      INSERT INTO audit_log (id, actor_id, action, target, detail)
      SELECT ${issued.id}, ${issued.actorId}, ${issued.action}, ${issued.target}, ${JSON.stringify(issued.detail)}
      WHERE ${posts}
    `,
  ]

  if (pass.requestId) {
    const fulfilled = auditEntry({ actorId, action: 'pass.request.fulfilled', target: `pass-request:${pass.requestId}`, detail: { passId: pass.passId } })
    statements.push(
      sql`
        UPDATE pass_requests SET status = 'FULFILLED', pass_id = ${pass.passId}, decided_by = ${actorId}, decided_at = unixepoch()
        WHERE id = ${pass.requestId} AND status = 'PENDING' AND ${posts}
      `,
      sql`
        INSERT INTO audit_log (id, actor_id, action, target, detail)
        SELECT ${fulfilled.id}, ${fulfilled.actorId}, ${fulfilled.action}, ${fulfilled.target}, ${JSON.stringify(fulfilled.detail)}
        WHERE changes() = 1
      `,
    )
  }
  return statements
}

export function tillPassStatements(pass: ResolvedTillPass, entryId: string, actorId: string): BatchItem<'sqlite'>[] {
  return tillPassSql(pass, entryId, actorId).map(statement => db.run(statement))
}

export function passCapRaised(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed: passes\.id/.test(error.message)
}

export function passCapSays(maxIssued: number | null): string {
  return `${passCapReason(maxIssued) ?? 'This pass could not be issued.'} Nothing has been issued.`
}

export interface SwapIds {
  passId: string
  userId: string
  reservationId: string
  reference: string
  ticketId: string
  ticketTypeId: string
  capacity: number | null
  now: number
}

// D-134 criterion 3 without its ledger line: the new booking, the old one cancelled pointing at
// it, the seat, and 0035's assertion re-inserting the new booking's id unless all of it landed.
export function swapSql(swap: SwapCandidate, ids: SwapIds): { claim: SQL[], assertion: SQL } {
  const columns = sql`id, reference, performance_id, user_id, status, source, window_bypassed, hold_expires_at`
  const values = sql`${ids.reservationId}, ${ids.reference}, ${swap.performanceId}, ${ids.userId}, 'PENDING', 'DOOR', 0, NULL`
  return {
    claim: [
      sql`INSERT INTO reservations (${columns}) VALUES (${values})`,
      sql`
        UPDATE reservations
        SET status = 'CANCELLED', cancelled_by = 'STAFF', exchanged_to_reservation_id = ${ids.reservationId}, hold_expires_at = NULL, updated_at = unixepoch()
        WHERE id = ${swap.reservationId} AND user_id = ${ids.userId} AND status = 'PENDING'
      `,
      passAdmissionTicketInsert(
        { id: ids.ticketId, reservationId: ids.reservationId, performanceId: swap.performanceId, ticketTypeId: ids.ticketTypeId, pricePaid: 0, priceSource: 'BASE' },
        passAdmissionAllows(ids.passId, swap.performanceId, swap.showId, ids.now),
        ids.capacity,
      ),
      sql`
        INSERT INTO pass_admissions (id, pass_id, performance_id, ticket_id, admitted_by)
        SELECT ${newId()}, ${ids.passId}, ${swap.performanceId}, ${ids.ticketId}, NULL
        WHERE changes() = 1
      `,
    ],
    assertion: sql`
      INSERT INTO reservations (${columns})
      SELECT ${ids.reservationId}, ${ids.reservationId}, ${swap.performanceId}, ${ids.userId}, 'PENDING', 'DOOR', 0, NULL
      WHERE NOT EXISTS (SELECT 1 FROM tickets WHERE id = ${ids.ticketId})
         OR NOT EXISTS (SELECT 1 FROM reservations WHERE id = ${swap.reservationId} AND exchanged_to_reservation_id = ${ids.reservationId})
    `,
  }
}

export function swapRefused(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed: reservations\.id/.test(error.message)
}

export interface SwapResult {
  moved: boolean
  reference?: string
}

// After the sale's batch, so the pass exists to redeem (D-134 criterion 3).
export async function swapBookingOntoPass(passId: string, userId: string, swap: SwapCandidate, actorId: string, at = new Date()): Promise<SwapResult> {
  const performance = await performanceById(swap.performanceId)
  if (!performance) return { moved: false }
  const ids: SwapIds = {
    passId,
    userId,
    reservationId: newId(),
    reference: generateReservationReference(),
    ticketId: newId(),
    ticketTypeId: await passAdmissionTicketType(),
    capacity: effectiveCapacity(performance),
    now: Math.floor(at.getTime() / 1000),
  }
  const { claim, assertion } = swapSql(swap, ids)

  const posted = postEntry({
    source: 'DESK',
    tender: 'NONE',
    actorId,
    lines: [{ kind: 'PASS_ADMISSION', amountPence: 0, qty: 1, unitPricePence: 0, reservationId: ids.reservationId, performanceId: swap.performanceId, ticketId: ids.ticketId, priceRef: passId }],
  }, at, sql`changes() = 1`)
  const moved = auditEntry({ actorId, action: 'reservation.exchanged', target: `reservation:${swap.reservationId}`, detail: { toReservationId: ids.reservationId, passId } })
  const redeemed = auditEntry({ actorId, action: 'pass.redeemed', target: `pass:${passId}`, detail: { performanceId: swap.performanceId, ticketId: ids.ticketId } })

  const statements: BatchItem<'sqlite'>[] = [
    ...claim.map(statement => db.run(statement)),
    ...posted.statements,
    ...[moved, redeemed].map(entry => db.run(sql`
      INSERT INTO audit_log (id, actor_id, action, target, detail)
      SELECT ${entry.id}, ${entry.actorId}, ${entry.action}, ${entry.target}, ${JSON.stringify(entry.detail)}
      WHERE EXISTS (SELECT 1 FROM ledger_entries WHERE id = ${posted.id})
    `)),
    db.run(assertion),
  ]

  try {
    await runLedgerBatch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
  }
  catch (error) {
    if (swapRefused(error)) return { moved: false }
    throw error
  }
  return { moved: true, reference: ids.reference }
}
