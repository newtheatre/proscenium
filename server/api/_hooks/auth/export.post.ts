import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.object({ userId: z.string().min(1) })

/**
 * POST /api/_hooks/auth/export: this app's contribution to a subject-access
 * bundle (stage-door docs/gdpr-retention.md). Service-hook auth.
 */
export default defineEventHandler(async (event) => {
  requireHookAuth(event)
  const { userId } = await readValidatedBody(event, bodySchema.parse)

  const user = await db.select({
    email: schema.users.email,
    name: schema.users.name,
    createdAt: schema.users.createdAt,
  }).from(schema.users).where(eq(schema.users.id, userId)).get()

  // Explicit joins (the relation-query types misbehave in this context).
  const reservations = await db.select({
    id: schema.reservations.id,
    bookingRef: schema.reservations.bookingRef,
    status: schema.reservations.status,
    customerNotes: schema.reservations.customerNotes,
    createdAt: schema.reservations.createdAt,
    performanceStartsAt: schema.performances.startsAt,
    showTitle: schema.shows.title,
  }).from(schema.reservations)
    .leftJoin(schema.performances, eq(schema.reservations.performanceId, schema.performances.id))
    .leftJoin(schema.shows, eq(schema.performances.showId, schema.shows.id))
    .where(eq(schema.reservations.userId, userId))

  // Joined on the owner rather than a bound list of reservation ids: a regular
  // attendee is well past 100 of them (ADR-0006).
  const ticketTotals = new Map<string, { count: number, total: number }>()
  if (reservations.length) {
    const ticketRows = await db.select({
      reservationId: schema.tickets.reservationId,
      pricePaid: schema.tickets.pricePaid,
    }).from(schema.tickets)
      .innerJoin(schema.reservations, eq(schema.tickets.reservationId, schema.reservations.id))
      .where(eq(schema.reservations.userId, userId))
    for (const t of ticketRows) {
      const entry = ticketTotals.get(t.reservationId) ?? { count: 0, total: 0 }
      entry.count += 1
      entry.total += t.pricePaid
      ticketTotals.set(t.reservationId, entry)
    }
  }

  const passes = await db.select({
    status: schema.passes.status,
    pricePaid: schema.passes.pricePaid,
    createdAt: schema.passes.createdAt,
    typeName: schema.passTypes.name,
  }).from(schema.passes)
    .leftJoin(schema.passTypes, eq(schema.passes.passTypeId, schema.passTypes.id))
    .where(eq(schema.passes.userId, userId))

  // Special category data, so it is the part of this bundle that matters most
  // to get right (ADR-0022).
  const access = await db.select({
    status: schema.accessProfiles.status,
    accessCardNumber: schema.accessProfiles.accessCardNumber,
    difficultyStanding: schema.accessProfiles.difficultyStanding,
    difficultyWithCrowds: schema.accessProfiles.difficultyWithCrowds,
    levelAccess: schema.accessProfiles.levelAccess,
    distance: schema.accessProfiles.distance,
    urgentToilet: schema.accessProfiles.urgentToilet,
    visualInformation: schema.accessProfiles.visualInformation,
    audibleInformation: schema.accessProfiles.audibleInformation,
    miscellaneous: schema.accessProfiles.miscellaneous,
    companions: schema.accessProfiles.companions,
    fohNote: schema.accessProfiles.fohNote,
    consentGivenAt: schema.accessProfiles.consentFohAt,
    verifiedAt: schema.accessProfiles.verifiedAt,
    expiresAt: schema.accessProfiles.expiresAt,
  }).from(schema.accessProfiles).where(eq(schema.accessProfiles.userId, userId)).get()

  return {
    data: {
      profile: user ?? null,
      accessProfile: access ?? null,
      reservations: reservations.map(r => ({
        bookingRef: r.bookingRef,
        show: r.showTitle,
        performance: r.performanceStartsAt,
        status: r.status,
        notes: r.customerNotes,
        tickets: ticketTotals.get(r.id)?.count ?? 0,
        totalPaid: ticketTotals.get(r.id)?.total ?? 0,
        bookedAt: r.createdAt,
      })),
      passes: passes.map(p => ({
        type: p.typeName,
        status: p.status,
        pricePaid: p.pricePaid,
        issuedAt: p.createdAt,
      })),
    },
  }
})
