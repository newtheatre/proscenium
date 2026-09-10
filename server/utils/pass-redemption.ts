import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { newId } from './accounts'
import { capacityAllows } from './capacity'
import { postEntry } from './ledger'
import { auditEntry } from '#shared/utils/audit'
import { generateReservationReference } from '#shared/utils/reservations'
import type { SQL } from 'drizzle-orm'

// D-125: redeeming a pass while reserving online, self-serve. `redeemPass()` below is also
// D-126's door path and D-130's Fellow admission: both write through it with a different
// `source` and `admittedBy`, never a second copy of the once-per-performance or capacity guard.

export interface PassRedemptionStateRow {
  id: string
  userId: string
  status: string
  passTypeName: string
  passTypeStatus: string
  validFrom: number
  validUntil: number
  coversShow: number
}

// Everything a caller needs to decide criterion 1's refusal, read live rather than trusted from
// an earlier request (the same shape `saleRefusal` reads for an ordinary reservation).
export function passRedemptionStateQuery(passId: string, showId: string): SQL {
  return sql`
    SELECT p.id AS id, p.user_id AS userId, p.status AS status, t.name AS passTypeName, t.status AS passTypeStatus,
           t.valid_from AS validFrom, t.valid_until AS validUntil,
           EXISTS (SELECT 1 FROM pass_type_shows s WHERE s.pass_type_id = t.id AND s.show_id = ${showId}) AS coversShow
    FROM passes p
    JOIN pass_types t ON t.id = p.pass_type_id
    WHERE p.id = ${passId}
  `
}

export async function passRedemptionState(passId: string, showId: string): Promise<PassRedemptionStateRow | undefined> {
  const [row] = await db.all<PassRedemptionStateRow>(passRedemptionStateQuery(passId, showId))
  return row
}

export interface RedeemablePass {
  id: string
  reference: string
  passTypeName: string
}

// The pass a booking screen offers automatically (criterion 1): active, on sale, inside its
// window, covering this show, and not already redeemed for this exact performance. Oldest first,
// so a holder of more than one eligible pass is offered the one closest to lapsing.
export function redeemablePassQuery(userId: string, performanceId: string, showId: string, now: number): SQL {
  return sql`
    SELECT p.id AS id, p.reference AS reference, t.name AS passTypeName
    FROM passes p
    JOIN pass_types t ON t.id = p.pass_type_id
    WHERE p.user_id = ${userId}
      AND p.status = 'ACTIVE'
      AND t.status != 'CLOSED'
      AND t.valid_from <= ${now} AND t.valid_until >= ${now}
      AND EXISTS (SELECT 1 FROM pass_type_shows s WHERE s.pass_type_id = t.id AND s.show_id = ${showId})
      AND NOT EXISTS (SELECT 1 FROM pass_admissions a WHERE a.pass_id = p.id AND a.performance_id = ${performanceId})
    ORDER BY p.created_at
    LIMIT 1
  `
}

export async function redeemablePassFor(userId: string, performanceId: string, showId: string, now: number): Promise<RedeemablePass | undefined> {
  const [row] = await db.all<RedeemablePass>(redeemablePassQuery(userId, performanceId, showId, now))
  return row
}

// What a lost race quotes (criterion 2): read after the write already decided, never trusted
// from a check taken before it, so this is only what the refusal says.
export async function alreadyAdmittedForPerformance(passId: string, performanceId: string): Promise<boolean> {
  const [row] = await db.all<{ found: number }>(sql`
    SELECT EXISTS (SELECT 1 FROM pass_admissions WHERE pass_id = ${passId} AND performance_id = ${performanceId}) AS found
  `)
  return row?.found === 1
}

// Criterion 2 and criterion 3, both contended, both on the one statement that spends the seat
// (0003): once-per-performance is a fact about this exact pair, capacity a fact about the house,
// and the pass's own terms re-asked here rather than trusted from a read taken earlier, because
// a status can change between that read and this write.
export function passAdmissionAllows(passId: string, performanceId: string, showId: string, now: number, capacity: number | null, exceptReservationId: string): SQL {
  return sql`
    ${capacityAllows(performanceId, capacity, 1, exceptReservationId)}
    AND NOT EXISTS (SELECT 1 FROM pass_admissions WHERE pass_id = ${passId} AND performance_id = ${performanceId})
    AND EXISTS (
      SELECT 1 FROM passes p JOIN pass_types t ON t.id = p.pass_type_id
      WHERE p.id = ${passId} AND p.status = 'ACTIVE' AND t.status != 'CLOSED'
        AND t.valid_from <= ${now} AND t.valid_until >= ${now}
        AND EXISTS (SELECT 1 FROM pass_type_shows s WHERE s.pass_type_id = t.id AND s.show_id = ${showId})
    )
  `
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
}

// The one contended statement (criteria 2, 3), exported on its own so a racing test runs the
// exact statement production runs rather than a hand-copied shape (tests/integration/races-pass-redemption.test.ts).
// Zero-price and never collected at a desk, so there is nothing D-106's release sweep should ever
// touch: `hold_expires_at` stays NULL, the same state a desk-collected booking ends in.
export function passAdmissionTicketInsert(
  input: Pick<RedeemPassWriteInput, 'passId' | 'performanceId' | 'showId' | 'capacity'>,
  reservationId: string,
  ticketId: string,
  now: number,
): SQL {
  return sql`
    INSERT INTO tickets (id, reservation_id, performance_id, ticket_type_id, price_paid, price_source)
    SELECT ${ticketId}, ${reservationId}, ${input.performanceId},
           (SELECT id FROM ticket_types WHERE kind = 'PASS_ADMISSION' LIMIT 1), 0, 'BASE'
    WHERE ${passAdmissionAllows(input.passId, input.performanceId, input.showId, now, input.capacity, reservationId)}
    RETURNING id
  `
}

export interface RedeemPassResult {
  applied: boolean
  reservationId?: string
  reference?: string
  ticketId?: string
}

// Race-safe (criterion 2): the once-per-performance and capacity predicates are the ticket
// insert's own WHERE, so two concurrent redemptions of the same pass for the same performance
// leave exactly one ticket, one admission and one ledger line (0001, D-105's own pattern).
export async function redeemPass(input: RedeemPassWriteInput, at = new Date()): Promise<RedeemPassResult> {
  const reservationId = newId()
  const reference = generateReservationReference()
  const ticketId = newId()
  const admissionId = newId()
  // Only used the first time any pass is ever redeemed; every later call's own INSERT matches
  // nothing and writes no row (`WHERE NOT EXISTS`), so no seed step or migration owns this row.
  const systemTicketTypeId = newId()
  const now = Math.floor(at.getTime() / 1000)

  const ensureTicketType = sql`
    INSERT INTO ticket_types (id, name, price, kind)
    SELECT ${systemTicketTypeId}, 'Pass admission', 0, 'PASS_ADMISSION'
    WHERE NOT EXISTS (SELECT 1 FROM ticket_types WHERE kind = 'PASS_ADMISSION')
  `

  const reservationInsert = sql`
    INSERT INTO reservations (id, reference, performance_id, user_id, status, source, window_bypassed, hold_expires_at)
    VALUES (${reservationId}, ${reference}, ${input.performanceId}, ${input.userId}, 'PENDING', ${input.source}, 0, NULL)
  `

  const ticketInsert = passAdmissionTicketInsert(input, reservationId, ticketId, now)

  // Guarded on the ticket insert's own `changes()`: a ticket the guard above refused leaves
  // nothing here to admit either, so a lost race writes neither (D-124's own `issuePass` shape).
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
    // Money that did not move, and still a fact (architecture.md): the pass is the price
    // reference, so per-admission utilisation is queryable per pass (criterion 5).
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

  const results = await db.batch([
    db.run(ensureTicketType),
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

  const ticketRows = results[2] as { id: string }[]
  const applied = ticketRows.length > 0

  // A refused redemption holds nothing, so the empty reservation it left behind says so rather
  // than sitting as a PENDING row no sweep has any reason to ever touch (writeReservation's own
  // shape, D-104).
  if (!applied) {
    await db.run(sql`UPDATE reservations SET status = 'CANCELLED', updated_at = unixepoch() WHERE id = ${reservationId} AND status = 'PENDING'`)
  }

  return applied
    ? { applied: true, reservationId, reference, ticketId }
    : { applied: false }
}
