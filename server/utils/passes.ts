import { db, schema } from '@nuxthub/db'
import { and, count, eq, isNull } from 'drizzle-orm'

/**
 * Pass redemption rules.
 *
 * `canRedeem` is the ONLY place the entitlement rule lives. The booking flow,
 * the box office and any future API all call it. There are already five copies
 * of the ticket-price resolution rule in this codebase's history — do not start
 * a sixth family here.
 *
 * Note the database enforces the once-per-performance rule too, via
 * `UNIQUE (pass_id, performance_id)` on pass_admissions. D1 has no interactive
 * transactions, so that index is what actually holds under a double-submit;
 * this function is for giving a human a reason, not for safety.
 */

export type PassRejection
  = | 'PASS_NOT_ACTIVE'
    | 'OUTSIDE_VALIDITY'
    | 'SHOW_NOT_COVERED'
    | 'ALREADY_REDEEMED'
    | 'PERFORMANCE_NOT_ON_SALE'
    | 'SOLD_OUT'

/** Copy a volunteer can read out at the door. */
export const PASS_REJECTION_MESSAGE: Record<PassRejection, string> = {
  PASS_NOT_ACTIVE: 'This pass has been cancelled — please see the Box Office Manager.',
  OUTSIDE_VALIDITY: 'This pass does not cover tonight — it is outside its validity dates.',
  SHOW_NOT_COVERED: 'This pass does not cover this show.',
  ALREADY_REDEEMED: 'This pass has already been used for this performance.',
  PERFORMANCE_NOT_ON_SALE: 'This performance is not on sale.',
  SOLD_OUT: 'We\'re full tonight, I\'m afraid — a pass doesn\'t reserve a seat.',
}

export interface RedeemCheck {
  ok: boolean
  reason?: PassRejection
  message?: string
}

/** Which rejections a member of staff is allowed to override at the door. */
export const STAFF_OVERRIDABLE: PassRejection[] = ['PERFORMANCE_NOT_ON_SALE']

/**
 * Decide whether `passId` may be redeemed against `performanceId`.
 *
 * Checked in the order a human would explain it: is the pass alive, is it in
 * date, does it cover this show, has it already been used tonight, is the
 * performance sellable, and is there room.
 */
export async function canRedeem(passId: string, performanceId: string): Promise<RedeemCheck> {
  const reject = (reason: PassRejection): RedeemCheck => ({
    ok: false,
    reason,
    message: PASS_REJECTION_MESSAGE[reason],
  })

  const pass = await db
    .select({
      id: schema.passes.id,
      status: schema.passes.status,
      passTypeId: schema.passes.passTypeId,
      validFrom: schema.passTypes.validFrom,
      validTo: schema.passTypes.validTo,
    })
    .from(schema.passes)
    .innerJoin(schema.passTypes, eq(schema.passes.passTypeId, schema.passTypes.id))
    .where(eq(schema.passes.id, passId))
    .get()

  if (!pass) throw createError({ statusCode: 404, statusMessage: 'Pass not found' })
  if (pass.status !== 'ACTIVE') return reject('PASS_NOT_ACTIVE')

  const performance = await db
    .select({
      id: schema.performances.id,
      showId: schema.performances.showId,
      startsAt: schema.performances.startsAt,
      status: schema.performances.status,
      capacityOverride: schema.performances.capacityOverride,
      venueCapacity: schema.venues.capacity,
    })
    .from(schema.performances)
    .innerJoin(schema.venues, eq(schema.performances.venueId, schema.venues.id))
    .where(eq(schema.performances.id, performanceId))
    .get()

  if (!performance) throw createError({ statusCode: 404, statusMessage: 'Performance not found' })

  // Validity is judged against the performance, not "now" — admitting someone
  // at 19:25 to a 19:30 show on the pass's last day should work.
  const startsAt = performance.startsAt.getTime()
  if (startsAt < pass.validFrom.getTime() || startsAt > pass.validTo.getTime()) {
    return reject('OUTSIDE_VALIDITY')
  }

  const covered = await db
    .select({ id: schema.passTypeShows.id })
    .from(schema.passTypeShows)
    .where(and(
      eq(schema.passTypeShows.passTypeId, pass.passTypeId),
      eq(schema.passTypeShows.showId, performance.showId),
    ))
    .get()

  if (!covered) return reject('SHOW_NOT_COVERED')

  const already = await db
    .select({ id: schema.passAdmissions.id })
    .from(schema.passAdmissions)
    .where(and(
      eq(schema.passAdmissions.passId, passId),
      eq(schema.passAdmissions.performanceId, performanceId),
    ))
    .get()

  if (already) return reject('ALREADY_REDEEMED')

  if (performance.status !== 'ON_SALE') return reject('PERFORMANCE_NOT_ON_SALE')

  // A pass grants entitlement, not a reserved seat: it is still subject to
  // capacity like any other ticket.
  const capacity = performance.capacityOverride ?? performance.venueCapacity
  if (capacity != null) {
    const [sold] = await db
      .select({ n: count() })
      .from(schema.tickets)
      .innerJoin(schema.reservations, eq(schema.tickets.reservationId, schema.reservations.id))
      .where(and(
        eq(schema.tickets.performanceId, performanceId),
        isNull(schema.tickets.refundedAt),
      ))

    if ((sold?.n ?? 0) >= capacity) return reject('SOLD_OUT')
  }

  return { ok: true }
}

/**
 * The ticket type used for pass admissions — a £0 `PASS_ADMISSION` type.
 * Created on first use so passes work without a seeding step.
 */
export async function getPassAdmissionTicketTypeId(): Promise<string> {
  const existing = await db
    .select({ id: schema.ticketTypes.id })
    .from(schema.ticketTypes)
    .where(eq(schema.ticketTypes.kind, 'PASS_ADMISSION'))
    .get()

  if (existing) return existing.id

  const [created] = await db.insert(schema.ticketTypes).values({
    name: 'Pass admission',
    description: 'Admission redeemed against a pass. Carries no money; counts against capacity.',
    price: 0,
    kind: 'PASS_ADMISSION',
    activeByDefault: false,
  }).returning({ id: schema.ticketTypes.id })

  if (!created) throw createError({ statusCode: 500, statusMessage: 'Could not create the pass admission ticket type' })
  return created.id
}
