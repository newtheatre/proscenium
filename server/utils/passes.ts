import { db, schema } from '@nuxthub/db'
import { and, eq, inArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'

/**
 * Pass redemption. `decideRedeem` is the only copy of the entitlement rule;
 * the once-per-performance half is enforced by a UNIQUE index, not here.
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
 * The entitlement rule. Pure, so canRedeem and redeemabilityForPage share it.
 * Order is load-bearing where a reason is staff-overridable (STAFF_OVERRIDABLE).
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

  // Judged against the performance, not "now", which only holds because validTo
  // is the last instant of its day — see server/utils/validityWindow.ts.
  const startsAt = performance.startsAt.getTime()
  if (startsAt < pass.validFrom.getTime() || startsAt > pass.validTo.getTime()) {
    return reject('OUTSIDE_VALIDITY')
  }

  if (!coversShow) return reject('SHOW_NOT_COVERED')
  if (alreadyRedeemed) return reject('ALREADY_REDEEMED')
  // Ahead of PERFORMANCE_NOT_ON_SALE, which staff may override: the other way
  // round, overriding a closed performance also admits into a full house.
  if (soldOut) return reject('SOLD_OUT')
  if (performance.status !== 'ON_SALE') return reject('PERFORMANCE_NOT_ON_SALE')

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
 * Four queries for the page rather than five per pass, which at limit=100
 * would exceed the subrequest cap. Neither binds an id list (ADR-0006).
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

export interface AdmitOnPassInput {
  passId: string
  holderUserId: string
  performanceId: string
  /** Null when the holder redeemed it themselves online. */
  redeemedByUserId: string | null
  /** `DOOR` for a door admission, `WEB` when the holder booked ahead. */
  source: 'DOOR' | 'WEB'
  status: 'DOOR' | 'PENDING'
  staffNote?: string
}

/**
 * The one way a pass becomes a seat, used by the door and by the holder
 * online. Do not start a second copy (docs/10 §4).
 */
export async function admitOnPass(input: AdmitOnPassInput) {
  // A pass admission takes a seat, so it passes the one seat-counting rule
  // here rather than relying on every caller checking first (ADR-0007).
  await assertCapacity(input.performanceId, 1)

  const ticketTypeId = await getPassAdmissionTicketTypeId()

  // Admit against an existing reservation for this holder and performance if
  // there is one — the door list should show one party, not two.
  const existing = await db.select({ id: schema.reservations.id })
    .from(schema.reservations)
    .where(and(
      eq(schema.reservations.userId, input.holderUserId),
      eq(schema.reservations.performanceId, input.performanceId),
      inArray(schema.reservations.status, ['PENDING', 'COLLECTED', 'DOOR']),
    ))
    .get()

  const reservationId = existing?.id ?? nanoid()
  const ticketId = nanoid()

  const ticketInsert = db.insert(schema.tickets).values({
    id: ticketId,
    reservationId,
    performanceId: input.performanceId,
    ticketTypeId,
    pricePaid: 0,
  })
  const admissionInsert = db.insert(schema.passAdmissions).values({
    passId: input.passId,
    ticketId,
    performanceId: input.performanceId,
    redeemedByUserId: input.redeemedByUserId,
  })

  if (existing) {
    await db.batch([ticketInsert, admissionInsert])
  }
  else {
    await db.batch([
      db.insert(schema.reservations).values({
        id: reservationId,
        performanceId: input.performanceId,
        userId: input.holderUserId,
        status: input.status,
        source: input.source,
        staffNotes: input.staffNote ?? null,
      }),
      ticketInsert,
      admissionInsert,
    ])
  }

  return { reservationId, ticketId, joinedExisting: Boolean(existing) }
}
