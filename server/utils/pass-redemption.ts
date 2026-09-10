import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { newId } from './accounts'
import { passAdmissionTicketInsert } from './capacity'
import { postEntry, runLedgerBatch } from './ledger'
import { auditEntry } from '#shared/utils/audit'
import { passRedemptionRefusal } from '#shared/utils/passes'
import { generateReservationReference } from '#shared/utils/reservations'
import type { SQL } from 'drizzle-orm'

// D-125: redeeming a pass while reserving online. `redeemPass()` is also D-126's door path and
// D-130's Fellow admission, both with a different `source` and `admittedBy`.

export interface PassRedemptionStateRow {
  id: string
  userId: string
  status: string
  passTypeName: string
  passTypeStatus: string
  validFrom: number
  validUntil: number
  coversShow: number
  anonymised: number
}

// A Fellowship covers everything the theatre puts on, standing in for "our own productions only"
// until `shows` carries an external-hire flag (D-302, Later, 0023, D-130).
function coversShowClause(showId: string): SQL {
  return sql`(EXISTS (SELECT 1 FROM pass_type_shows s WHERE s.pass_type_id = t.id AND s.show_id = ${showId}) OR t.slug = 'fellowship')`
}

// Shared by both lookups below; `anonymised` is D-130's own guard, checked ahead of everything
// else that decides a redemption (0062).
function stateColumns(showId: string): SQL {
  return sql`
    p.id AS id, p.user_id AS userId, p.status AS status, t.name AS passTypeName, t.status AS passTypeStatus,
    t.valid_from AS validFrom, t.valid_until AS validUntil,
    ${coversShowClause(showId)} AS coversShow,
    u.anonymised_at IS NOT NULL AS anonymised
  `
}

// What a caller needs to decide criterion 1's refusal, read live (the same shape `saleRefusal`
// reads for an ordinary reservation).
export function passRedemptionStateQuery(passId: string, showId: string): SQL {
  return sql`
    SELECT ${stateColumns(showId)}
    FROM passes p
    JOIN pass_types t ON t.id = p.pass_type_id
    JOIN users u ON u.id = p.user_id
    WHERE p.id = ${passId}
  `
}

export async function passRedemptionState(passId: string, showId: string): Promise<PassRedemptionStateRow | undefined> {
  const [row] = await db.all<PassRedemptionStateRow>(passRedemptionStateQuery(passId, showId))
  return row
}

// D-126's own lookup: the door reads a pass by its reference, the same no-look-alike code a desk
// search reads a reservation by, never the holder's own QR cookie scheme.
export async function passRedemptionStateByReference(reference: string, showId: string): Promise<PassRedemptionStateRow | undefined> {
  const [row] = await db.all<PassRedemptionStateRow>(sql`
    SELECT ${stateColumns(showId)}
    FROM passes p
    JOIN pass_types t ON t.id = p.pass_type_id
    JOIN users u ON u.id = p.user_id
    WHERE p.reference = ${reference.toUpperCase()}
  `)
  return row
}

// One mapping from the row both lookups above return to `passRedemptionRefusal`'s own shape,
// so a route never re-lists the five fields by hand.
export function refusalFor(row: PassRedemptionStateRow, now: number): string | null {
  return passRedemptionRefusal({
    status: row.status,
    passTypeStatus: row.passTypeStatus,
    validFrom: row.validFrom,
    validUntil: row.validUntil,
    coversShow: row.coversShow === 1,
    anonymised: row.anonymised === 1,
  }, now)
}

export interface RedeemablePass {
  id: string
  reference: string
  passTypeName: string
}

// A Fellow's own pass never names itself in a screen anyone else can see (D-130 criterion 6):
// the public booking page reads this label, never `pass_types.name` directly.
const DISPLAY_NAME = sql`CASE WHEN t.slug = 'fellowship' THEN 'Pass' ELSE t.name END`

// What a booking screen offers automatically (criterion 1): eligible and not already redeemed
// for this performance. Oldest first, so a holder of more than one offers the one nearest lapsing.
export function redeemablePassQuery(userId: string, performanceId: string, showId: string, now: number): SQL {
  return sql`
    SELECT p.id AS id, p.reference AS reference, ${DISPLAY_NAME} AS passTypeName
    FROM passes p
    JOIN pass_types t ON t.id = p.pass_type_id
    JOIN users u ON u.id = p.user_id
    WHERE p.user_id = ${userId}
      AND p.status = 'ACTIVE'
      AND t.status != 'CLOSED'
      AND t.valid_from <= ${now} AND t.valid_until >= ${now}
      AND u.anonymised_at IS NULL
      AND ${coversShowClause(showId)}
      AND NOT EXISTS (SELECT 1 FROM pass_admissions a WHERE a.pass_id = p.id AND a.performance_id = ${performanceId})
    ORDER BY p.created_at
    LIMIT 1
  `
}

export async function redeemablePassFor(userId: string, performanceId: string, showId: string, now: number): Promise<RedeemablePass | undefined> {
  const [row] = await db.all<RedeemablePass>(redeemablePassQuery(userId, performanceId, showId, now))
  return row
}

// What a lost race quotes (criterion 2): read after the write already decided.
export interface ExistingAdmission {
  admittedAt: number
}

// D-130 criterion 3: a second attempt quotes the first, never a bare refusal.
export async function existingAdmissionFor(passId: string, performanceId: string): Promise<ExistingAdmission | undefined> {
  const [row] = await db.all<ExistingAdmission>(sql`
    SELECT admitted_at AS admittedAt FROM pass_admissions WHERE pass_id = ${passId} AND performance_id = ${performanceId}
  `)
  return row
}

export interface PassAdmissionForPerformance {
  ticketId: string
  reservationId: string
  reservationStatus: string
  admittedAt: number
}

// D-126 criterion 1's other branch: a pass already redeemed for tonight, so the door's job is
// admitting the seat that exists rather than spending a new one.
export async function admissionForPerformance(passId: string, performanceId: string): Promise<PassAdmissionForPerformance | undefined> {
  const [row] = await db.all<PassAdmissionForPerformance>(sql`
    SELECT a.ticket_id AS ticketId, t.reservation_id AS reservationId, r.status AS reservationStatus, a.admitted_at AS admittedAt
    FROM pass_admissions a
    JOIN tickets t ON t.id = a.ticket_id
    JOIN reservations r ON r.id = t.reservation_id
    WHERE a.pass_id = ${passId} AND a.performance_id = ${performanceId}
  `)
  return row
}

// Criteria 2 and 3 as one predicate, re-asked here rather than trusted from an earlier read
// (0003, 0062). Capacity is `passAdmissionTicketInsert`'s own.
export function passAdmissionAllows(passId: string, performanceId: string, showId: string, now: number): SQL {
  return sql`
    NOT EXISTS (SELECT 1 FROM pass_admissions WHERE pass_id = ${passId} AND performance_id = ${performanceId})
    AND EXISTS (
      SELECT 1 FROM passes p JOIN pass_types t ON t.id = p.pass_type_id JOIN users u ON u.id = p.user_id
      WHERE p.id = ${passId} AND p.status = 'ACTIVE' AND t.status != 'CLOSED'
        AND t.valid_from <= ${now} AND t.valid_until >= ${now}
        AND u.anonymised_at IS NULL
        AND ${coversShowClause(showId)}
    )
  `
}

// The one row every redeemed pass ticket shares, created once and read every time after
// (`ON CONFLICT` on the same name D-119 already protects, so a race leaves exactly one).
export async function ensurePassAdmissionTicketType(): Promise<string> {
  const [existing] = await db.all<{ id: string }>(sql`SELECT id FROM ticket_types WHERE kind = 'PASS_ADMISSION' LIMIT 1`)
  if (existing) return existing.id

  const id = newId()
  await db.run(sql`
    INSERT INTO ticket_types (id, name, price, kind) VALUES (${id}, 'Pass admission', 0, 'PASS_ADMISSION')
    ON CONFLICT (name) DO NOTHING
  `)
  const [row] = await db.all<{ id: string }>(sql`SELECT id FROM ticket_types WHERE kind = 'PASS_ADMISSION' LIMIT 1`)
  return row!.id
}

export interface RedeemPassWriteInput {
  passId: string
  userId: string
  performanceId: string
  showId: string
  capacity: number | null
  // WEB is D-125's own self-serve path; DOOR is D-126's and D-130's.
  source: 'WEB' | 'DOOR'
  // The pass holder redeems their own (null); an officer scanning one at the door names themself.
  admittedBy: string | null
  actorId: string | null
  // True only for D-126's on-the-spot redemption: the seat and the physical admission are one
  // gesture, so the reservation is born already checked in rather than PENDING (E-112's `admitted`).
  admitImmediately?: boolean
}

export interface RedeemPassResult {
  applied: boolean
  reservationId?: string
  reference?: string
  ticketId?: string
}

// Race-safe (criteria 2, 3): the contended guard rides the ticket insert's own WHERE
// (`passAdmissionTicketInsert`, server/utils/capacity.ts), so a lost race writes nothing at all.
export async function redeemPass(input: RedeemPassWriteInput, at = new Date()): Promise<RedeemPassResult> {
  const reservationId = newId()
  const reference = generateReservationReference()
  const ticketId = newId()
  const admissionId = newId()
  const now = Math.floor(at.getTime() / 1000)
  const ticketTypeId = await ensurePassAdmissionTicketType()

  const reservationInsert = sql`
    INSERT INTO reservations (id, reference, performance_id, user_id, status, source, window_bypassed, hold_expires_at)
    VALUES (${reservationId}, ${reference}, ${input.performanceId}, ${input.userId}, ${input.admitImmediately ? 'DOOR' : 'PENDING'}, ${input.source}, 0, NULL)
  `

  const ticketInsert = passAdmissionTicketInsert(
    { id: ticketId, reservationId, performanceId: input.performanceId, ticketTypeId, pricePaid: 0, priceSource: 'BASE' },
    passAdmissionAllows(input.passId, input.performanceId, input.showId, now),
    input.capacity,
  )

  // Guarded on the ticket insert's own `changes()`: a refused ticket leaves nothing to admit
  // (D-124's own `issuePass` shape).
  const admissionInsert = sql`
    INSERT INTO pass_admissions (id, pass_id, performance_id, ticket_id, admitted_by)
    SELECT ${admissionId}, ${input.passId}, ${input.performanceId}, ${ticketId}, ${input.admittedBy}
    WHERE changes() = 1
    RETURNING id
  `

  const posted = postEntry({
    source: input.source === 'DOOR' ? 'DESK' : 'SELF_SERVE',
    tender: 'NONE',
    actorId: input.actorId,
    // Zero-value: money that did not move, and still a fact (architecture.md, criterion 5).
    lines: [{
      kind: 'PASS_ADMISSION', amountPence: 0, qty: 1, unitPricePence: 0,
      reservationId, performanceId: input.performanceId, ticketId, priceRef: input.passId,
    }],
  }, at, sql`changes() = 1`)

  const entry = auditEntry({
    actorId: input.actorId,
    action: 'pass.redeemed',
    target: `pass:${input.passId}`,
    detail: { performanceId: input.performanceId, ticketId },
  })

  const results = await runLedgerBatch([
    db.run(reservationInsert),
    db.all<{ id: string }>(ticketInsert),
    db.all<{ id: string }>(admissionInsert),
    ...posted.statements,
    db.run(sql`
      INSERT INTO audit_log (id, actor_id, action, target, detail)
      SELECT ${entry.id}, ${entry.actorId}, ${entry.action}, ${entry.target}, ${JSON.stringify(entry.detail)}
      WHERE EXISTS (SELECT 1 FROM ledger_entries WHERE id = ${posted.id})
    `),
  ])

  const ticketRows = results[1] as { id: string }[]
  const applied = ticketRows.length > 0

  // A refused redemption holds nothing, so the empty reservation it left says so rather than
  // sitting as an open-looking row no sweep has reason to touch (`writeReservation`'s own shape, D-104).
  if (!applied) {
    await db.run(sql`UPDATE reservations SET status = 'CANCELLED', updated_at = unixepoch() WHERE id = ${reservationId} AND status IN ('PENDING', 'DOOR')`)
  }

  return applied
    ? { applied: true, reservationId, reference, ticketId }
    : { applied: false }
}
