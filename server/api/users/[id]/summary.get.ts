import { db, schema } from '@nuxthub/db'
import { count, desc, eq } from 'drizzle-orm'
import { canVerifyAccess, readUser } from '~~/shared/utils/abilities'

/**
 * GET /api/users/:id/summary — everything this app knows about one person's
 * relationship with it. Identity itself belongs to stage-door (docs/04).
 */
export default defineEventHandler(async (event) => {
  await authorize(event, readUser)

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'User ID is required' })

  const { user: actingUser } = await requireUserSession(event)

  const person = await db.select({
    id: schema.users.id,
    name: schema.users.name,
    email: schema.users.email,
    anonymisedAt: schema.users.anonymisedAt,
    createdAt: schema.users.createdAt,
  }).from(schema.users).where(eq(schema.users.id, id)).get()

  if (!person) throw createError({ statusCode: 404, statusMessage: 'No mirror row for that account' })

  const reservations = await db.select({
    id: schema.reservations.id,
    bookingRef: schema.reservations.bookingRef,
    status: schema.reservations.status,
    createdAt: schema.reservations.createdAt,
    startsAt: schema.performances.startsAt,
    showTitle: schema.shows.title,
  })
    .from(schema.reservations)
    .innerJoin(schema.performances, eq(schema.reservations.performanceId, schema.performances.id))
    .innerJoin(schema.shows, eq(schema.performances.showId, schema.shows.id))
    .where(eq(schema.reservations.userId, id))
    .orderBy(desc(schema.performances.startsAt))
    .limit(50)

  // Joined on the owner rather than an id list from the rows above (ADR-0006).
  const ticketRows = await db.select({
    reservationId: schema.tickets.reservationId,
    pricePaid: schema.tickets.pricePaid,
    refundedAt: schema.tickets.refundedAt,
  })
    .from(schema.tickets)
    .innerJoin(schema.reservations, eq(schema.tickets.reservationId, schema.reservations.id))
    .where(eq(schema.reservations.userId, id))

  const byReservation = new Map<string, { count: number, paidPence: number }>()
  for (const ticket of ticketRows) {
    const entry = byReservation.get(ticket.reservationId) ?? { count: 0, paidPence: 0 }
    if (!ticket.refundedAt) {
      entry.count++
      entry.paidPence += ticket.pricePaid
    }
    byReservation.set(ticket.reservationId, entry)
  }

  const passes = await db.select({
    id: schema.passes.id,
    reference: schema.passes.reference,
    status: schema.passes.status,
    pricePaid: schema.passes.pricePaid,
    typeName: schema.passTypes.name,
  })
    .from(schema.passes)
    .leftJoin(schema.passTypes, eq(schema.passes.passTypeId, schema.passTypes.id))
    .where(eq(schema.passes.userId, id))

  const shifts = await db.select({
    id: schema.performanceShifts.id,
    role: schema.performanceShifts.role,
    status: schema.performanceShifts.status,
    needsEligibilityReview: schema.performanceShifts.needsEligibilityReview,
    startsAt: schema.performances.startsAt,
    showTitle: schema.shows.title,
  })
    .from(schema.performanceShifts)
    .innerJoin(schema.performances, eq(schema.performanceShifts.performanceId, schema.performances.id))
    .innerJoin(schema.shows, eq(schema.performances.showId, schema.shows.id))
    .where(eq(schema.performanceShifts.userId, id))
    .orderBy(desc(schema.performances.startsAt))
    .limit(50)

  // What they wrote as staff. Counts only: the entries belong to their own
  // screens, where the append-only framing is visible.
  const [incidents] = await db.select({ n: count() })
    .from(schema.incidentLog).where(eq(schema.incidentLog.authorUserId, id))
  const [ageChecks] = await db.select({ n: count() })
    .from(schema.ageChecks).where(eq(schema.ageChecks.checkedByUserId, id))

  // Special category data: only for the people allowed to read it (ADR-0022).
  let access: { status: string, companions: number, consentFohAt: Date | null, expiresAt: Date | null } | null | undefined
  if (canVerifyAccess(actingUser)) {
    access = await db.select({
      status: schema.accessProfiles.status,
      companions: schema.accessProfiles.companions,
      consentFohAt: schema.accessProfiles.consentFohAt,
      expiresAt: schema.accessProfiles.expiresAt,
    }).from(schema.accessProfiles).where(eq(schema.accessProfiles.userId, id)).get() ?? null
  }

  return {
    person,
    reservations: reservations.map(reservation => ({
      ...reservation,
      tickets: byReservation.get(reservation.id)?.count ?? 0,
      paidPence: byReservation.get(reservation.id)?.paidPence ?? 0,
    })),
    passes,
    shifts,
    wrote: { incidents: incidents?.n ?? 0, ageChecks: ageChecks?.n ?? 0 },
    /** Undefined means "not yours to see"; null means "they have none". */
    access,
  }
})
