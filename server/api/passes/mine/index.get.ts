import { db, schema } from '@nuxthub/db'
import { asc, desc, eq } from 'drizzle-orm'

/**
 * GET /api/passes/mine — the holder's own passes. Column allow-listed: notes
 * and issuedByUserId are internal and must not reach a customer.
 */
export default defineEventHandler(async (event) => {
  // Identity only, so it must not be gated on role staleness (ADR-0008).
  const { id: userId } = await requireSessionUser(event)

  // Requests are shown alongside, because "I asked for one" is what the
  // holder is looking for before it exists (ADR-0028).
  const requests = await db.select({
    id: schema.passRequests.id,
    status: schema.passRequests.status,
    quotedPence: schema.passRequests.quotedPence,
    requestedAt: schema.passRequests.requestedAt,
    passTypeName: schema.passTypes.name,
  })
    .from(schema.passRequests)
    .innerJoin(schema.passTypes, eq(schema.passTypes.id, schema.passRequests.passTypeId))
    .where(eq(schema.passRequests.userId, userId))
    .orderBy(desc(schema.passRequests.requestedAt))

  const passes = await db.select({
    id: schema.passes.id,
    reference: schema.passes.reference,
    status: schema.passes.status,
    pricePaid: schema.passes.pricePaid,
    issuedAt: schema.passes.issuedAt,
    passTypeId: schema.passTypes.id,
    passTypeName: schema.passTypes.name,
    passTypeDescription: schema.passTypes.description,
    validFrom: schema.passTypes.validFrom,
    validTo: schema.passTypes.validTo,
  })
    .from(schema.passes)
    .innerJoin(schema.passTypes, eq(schema.passTypes.id, schema.passes.passTypeId))
    .where(eq(schema.passes.userId, userId))
    .orderBy(desc(schema.passes.issuedAt))

  if (!passes.length) return { passes: [], requests }

  // Scoped by the holder, so neither query binds an id list (ADR-0006).
  const [covered, admissions] = await Promise.all([
    db.select({
      passTypeId: schema.passTypeShows.passTypeId,
      showTitle: schema.shows.title,
      showSlug: schema.shows.slug,
    })
      .from(schema.passTypeShows)
      .innerJoin(schema.shows, eq(schema.shows.id, schema.passTypeShows.showId))
      .innerJoin(schema.passes, eq(schema.passes.passTypeId, schema.passTypeShows.passTypeId))
      .where(eq(schema.passes.userId, userId))
      .orderBy(asc(schema.shows.title)),

    db.select({
      passId: schema.passAdmissions.passId,
      performanceId: schema.passAdmissions.performanceId,
      startsAt: schema.performances.startsAt,
      showTitle: schema.shows.title,
    })
      .from(schema.passAdmissions)
      .innerJoin(schema.passes, eq(schema.passes.id, schema.passAdmissions.passId))
      .innerJoin(schema.performances, eq(schema.performances.id, schema.passAdmissions.performanceId))
      .innerJoin(schema.shows, eq(schema.shows.id, schema.performances.showId))
      .where(eq(schema.passes.userId, userId))
      .orderBy(desc(schema.performances.startsAt)),
  ])

  const now = new Date()
  return {
    requests,
    passes: passes.map(pass => ({
      ...pass,
      // Status is the record; whether it covers *today* is a separate question.
      inDate: pass.status === 'ACTIVE' && pass.validFrom <= now && pass.validTo >= now,
      shows: covered.filter(c => c.passTypeId === pass.passTypeId)
        .map(c => ({ title: c.showTitle, slug: c.showSlug })),
      admissions: admissions.filter(a => a.passId === pass.id)
        .map(a => ({ performanceId: a.performanceId, startsAt: a.startsAt, showTitle: a.showTitle })),
    })),
  }
})
