import { db, schema } from '@nuxthub/db'
import { and, eq } from 'drizzle-orm'

/**
 * Pass redemption rules. `decideRedeem` is the only copy of the entitlement
 * rule; every caller ends there.
 *
 * The once-per-performance rule is enforced in SQL by
 * `UNIQUE (pass_id, performance_id)` on pass_admissions. D1 has no interactive
 * transactions, so that index is what holds under a double-submit — this file
 * exists to give a human a reason, not for safety.
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

const reject = (reason: PassRejection): RedeemCheck => ({
  ok: false,
  reason,
  message: PASS_REJECTION_MESSAGE[reason],
})

/** A pass, reduced to what the entitlement rule actually looks at. */
interface PassFacts {
  status: string
  validFrom: Date
  validTo: Date
}

/** The performance, reduced likewise. */
interface PerformanceFacts {
  startsAt: Date
  status: string
}

/**
 * The entitlement rule. Pure — every input is already loaded, so `canRedeem`
 * (one pass) and `redeemabilityForPage` (many) can share it.
 *
 * Checked in the order a human would explain it: is the pass alive, is it in
 * date, does it cover this show, has it already been used tonight, is the
 * performance sellable, and is there room.
 */
export function decideRedeem(input: {
  pass: PassFacts
  performance: PerformanceFacts
  coversShow: boolean
  alreadyRedeemed: boolean
  soldOut: boolean
}): RedeemCheck {
  const { pass, performance, coversShow, alreadyRedeemed, soldOut } = input

  if (pass.status !== 'ACTIVE') return reject('PASS_NOT_ACTIVE')

  // Validity is judged against the performance, not "now" — admitting someone
  // at 19:25 to a 19:30 show on the pass's last day should work. That only
  // holds because validTo is stored as the last instant of its day; see
  // server/utils/validityWindow.ts.
  const startsAt = performance.startsAt.getTime()
  if (startsAt < pass.validFrom.getTime() || startsAt > pass.validTo.getTime()) {
    return reject('OUTSIDE_VALIDITY')
  }

  if (!coversShow) return reject('SHOW_NOT_COVERED')
  if (alreadyRedeemed) return reject('ALREADY_REDEEMED')
  if (performance.status !== 'ON_SALE') return reject('PERFORMANCE_NOT_ON_SALE')
  if (soldOut) return reject('SOLD_OUT')

  return { ok: true }
}

/**
 * Decide whether `passId` may be redeemed against `performanceId`.
 *
 * The authority for a single redemption. Loads what {@link decideRedeem} needs.
 */
export async function canRedeem(passId: string, performanceId: string): Promise<RedeemCheck> {
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

  const [covered, already, soldOut] = await Promise.all([
    db.select({ id: schema.passTypeShows.id })
      .from(schema.passTypeShows)
      .where(and(
        eq(schema.passTypeShows.passTypeId, pass.passTypeId),
        eq(schema.passTypeShows.showId, performance.showId),
      ))
      .get(),

    db.select({ id: schema.passAdmissions.id })
      .from(schema.passAdmissions)
      .where(and(
        eq(schema.passAdmissions.passId, passId),
        eq(schema.passAdmissions.performanceId, performanceId),
      ))
      .get(),

    isSoldOut(performance),
  ])

  return decideRedeem({
    pass,
    performance,
    coversShow: Boolean(covered),
    alreadyRedeemed: Boolean(already),
    soldOut,
  })
}

/**
 * A pass grants entitlement, not a reserved seat, so it is still subject to
 * capacity. Counted by the shared rule (ADR-0007).
 */
async function isSoldOut(performance: { id: string, capacityOverride: number | null, venueCapacity: number | null }): Promise<boolean> {
  const capacity = performance.capacityOverride ?? performance.venueCapacity
  if (capacity == null) return false
  return await countOccupiedSeatsFor(performance.id) >= capacity
}

/**
 * Redeemability for a whole page of passes against one performance: four
 * queries for the page rather than five per pass, which at `limit=100` would
 * exceed the Worker subrequest cap.
 *
 * Neither bulk query binds an id list (ADR-0006) — coverage is fetched for the
 * show and admissions for the performance, then matched in memory. Both sets
 * are small: a pass type covers a season, admissions are bounded by capacity.
 */
export async function redeemabilityForPage(
  performanceId: string,
  passes: Array<{ id: string, passTypeId: string, status: string, validFrom: Date, validTo: Date }>,
): Promise<Map<string, RedeemCheck>> {
  const result = new Map<string, RedeemCheck>()
  if (passes.length === 0) return result

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

  const [coveringTypes, admissions, soldOut] = await Promise.all([
    db.select({ passTypeId: schema.passTypeShows.passTypeId })
      .from(schema.passTypeShows)
      .where(eq(schema.passTypeShows.showId, performance.showId)),

    db.select({ passId: schema.passAdmissions.passId })
      .from(schema.passAdmissions)
      .where(eq(schema.passAdmissions.performanceId, performanceId)),

    isSoldOut(performance),
  ])

  const covers = new Set(coveringTypes.map(r => r.passTypeId))
  const redeemed = new Set(admissions.map(r => r.passId))

  for (const pass of passes) {
    result.set(pass.id, decideRedeem({
      pass,
      performance,
      coversShow: covers.has(pass.passTypeId),
      alreadyRedeemed: redeemed.has(pass.id),
      soldOut,
    }))
  }

  return result
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
