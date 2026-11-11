import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { auditIfChanged, auditedWrite, entryLanded } from './audit'
import { newId } from './accounts'
import { runLedgerBatch } from './ledger'
import { redemptionWrites } from './pass-redemption'
import { auditEntry } from '#shared/utils/audit'
import { generatePassReference } from '#shared/utils/passes'
import type { RedeemPassWriteInput } from './pass-redemption'
import type { AuditRow } from '#shared/utils/audit'
import type { BatchItem } from 'drizzle-orm/batch'
import type { SQL } from 'drizzle-orm'

// D-139 and D-140 (0261): a pass chosen while booking, unpaid until the till takes its price, and
// dropped or lapsed if it never is.

export interface ChosenPass {
  passId: string
  reference: string
  passTypeId: string
  passTypePriceId: string
  userId: string
  pricePence: number
}

// Unpaid, with no issuer yet; a second pass of the same type for the same holder is refused here.
export function chosenPassInsert(pass: ChosenPass): SQL {
  return sql`
    INSERT INTO passes (id, reference, pass_type_id, pass_type_price_id, user_id, price_paid, status, issued_by, paid)
    SELECT ${pass.passId}, ${pass.reference}, ${pass.passTypeId}, ${pass.passTypePriceId}, ${pass.userId}, ${pass.pricePence}, 'ACTIVE', NULL, 0
    WHERE NOT EXISTS (SELECT 1 FROM passes WHERE user_id = ${pass.userId} AND pass_type_id = ${pass.passTypeId} AND status = 'ACTIVE')
  `
}

// 0035's assertion: no seat means no pass, so a full house re-inserts the booking's own id and
// the whole batch, the pass included, rolls back.
export function chosenSeatAssertion(reservationId: string, performanceId: string, userId: string, ticketId: string): SQL {
  return sql`
    INSERT INTO reservations (id, reference, performance_id, user_id, status, source, window_bypassed, hold_expires_at)
    SELECT ${reservationId}, ${reservationId}, ${performanceId}, ${userId}, 'PENDING', 'WEB', 0, NULL
    WHERE NOT EXISTS (SELECT 1 FROM tickets WHERE id = ${ticketId})
  `
}

export function chosenSeatRefused(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed: reservations\.id/.test(error.message)
}

export interface ChoosePassWrite {
  passTypeId: string
  passTypePriceId: string
  pricePence: number
  redemption: Omit<RedeemPassWriteInput, 'passId'>
}

export interface ChoosePassResult {
  applied: boolean
  passId?: string
  reservationId?: string
  reference?: string
}

// D-139 criterion 1: the unpaid pass, its first seat, the admission and the zero-value line in one batch.
export async function choosePass(input: ChoosePassWrite, at = new Date()): Promise<ChoosePassResult> {
  const pass: ChosenPass = {
    passId: newId(),
    reference: generatePassReference(),
    passTypeId: input.passTypeId,
    passTypePriceId: input.passTypePriceId,
    userId: input.redemption.userId,
    pricePence: input.pricePence,
  }
  const writes = await redemptionWrites({ ...input.redemption, passId: pass.passId }, at)
  const chosen = auditEntry({ actorId: input.redemption.actorId, action: 'pass.chosen', target: `pass:${pass.passId}`, detail: { passTypeId: pass.passTypeId, pricePence: pass.pricePence } })

  const statements: BatchItem<'sqlite'>[] = [
    db.run(chosenPassInsert(pass)),
    db.run(auditIfChanged(chosen)),
    ...writes.statements,
    db.run(chosenSeatAssertion(writes.reservationId, input.redemption.performanceId, pass.userId, writes.ticketId)),
  ]
  try {
    await runLedgerBatch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
  }
  catch (error) {
    if (chosenSeatRefused(error)) return { applied: false }
    throw error
  }
  return { applied: true, passId: pass.passId, reservationId: writes.reservationId, reference: writes.reference }
}

// Every booking still held on the pass, by subquery rather than a list read back (0006).
function heldOnPass(passId: string): SQL {
  return sql`(
    SELECT k.reservation_id FROM pass_admissions a JOIN tickets k ON k.id = a.ticket_id WHERE a.pass_id = ${passId}
  )`
}

// D-140 criterion 3: paying clears the hold on every booking on the pass, gated on the sale's entry.
export function clearPassHoldsSql(passId: string, gate: SQL): SQL {
  return sql`
    UPDATE reservations SET hold_expires_at = NULL, updated_at = unixepoch()
    WHERE status = 'PENDING' AND id IN ${heldOnPass(passId)} AND ${gate}
  `
}

// D-140 criterion 4 and D-139 criterion 4: an unpaid pass ends, and its held bookings with it.
export function cancelHeldOnPassSql(passId: string, entry: AuditRow): SQL {
  return sql`
    UPDATE reservations SET status = 'CANCELLED', cancelled_by = 'STAFF', hold_expires_at = NULL, updated_at = unixepoch()
    WHERE status = 'PENDING' AND id IN ${heldOnPass(passId)} AND ${entryLanded(entry)}
  `
}

export function endUnpaidPassStatement(passId: string, status: 'CANCELLED' | 'EXPIRED'): SQL {
  return sql`
    UPDATE passes SET status = ${status}, updated_at = unixepoch()
    WHERE id = ${passId} AND paid = 0 AND status = 'ACTIVE'
    RETURNING id
  `
}

async function endUnpaidPass(passId: string, status: 'CANCELLED' | 'EXPIRED', entry: AuditRow): Promise<boolean> {
  return auditedWrite(db.all<{ id: string }>(endUnpaidPassStatement(passId, status)), entry, db.run(cancelHeldOnPassSql(passId, entry)))
}

// Drop the pass (D-140 criterion 4): nothing is charged, and tonight's seat is free to sell.
export async function dropUnpaidPass(passId: string, actorId: string): Promise<boolean> {
  return endUnpaidPass(passId, 'CANCELLED', auditEntry({ actorId, action: 'pass.dropped', target: `pass:${passId}` }))
}

export interface LapseUnpaidPassesRun {
  eligible: number
  lapsed: number
}

// Unpaid once its type's sales window has closed or its validity ended (D-139 criterion 4).
export function lapsingUnpaidPassesQuery(at: number, cap: number): SQL {
  return sql`
    SELECT p.id AS id FROM passes p
    JOIN pass_types t ON t.id = p.pass_type_id
    WHERE p.paid = 0 AND p.status = 'ACTIVE'
      AND ((t.sales_close_at IS NOT NULL AND t.sales_close_at <= ${at}) OR t.valid_until < ${at})
    ORDER BY p.created_at
    LIMIT ${cap}
  `
}

export async function lapseUnpaidPasses(now: Date, cap: number): Promise<LapseUnpaidPassesRun> {
  const at = Math.floor(now.getTime() / 1000)
  const candidates = await db.all<{ id: string }>(lapsingUnpaidPassesQuery(at, cap))
  let lapsed = 0
  for (const candidate of candidates) {
    const entry = auditEntry({ actorId: null, action: 'pass.lapsed', target: `pass:${candidate.id}` })
    if (await endUnpaidPass(candidate.id, 'EXPIRED', entry)) lapsed += 1
  }
  return { eligible: candidates.length, lapsed }
}
