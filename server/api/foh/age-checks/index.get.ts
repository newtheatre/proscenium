import { db, schema } from '@nuxthub/db'
import { and, desc, eq, gte, lte } from 'drizzle-orm'
import { workFoh } from '~~/shared/utils/abilities'

/** GET /api/foh/age-checks: tonight's register and its two counters. */
export default defineEventHandler(async (event) => {
  await authorize(event, workFoh)

  const { user } = await requireUserSession(event)
  // The register carries refusal descriptions and notes, so reading it needs
  // the same BAR shift that writing it does (ADR-0019, docs/13 §5).
  const night = await requireBarScope(user)

  const rows = await db.select({
    id: schema.ageChecks.id,
    outcome: schema.ageChecks.outcome,
    reason: schema.ageChecks.reason,
    productDescription: schema.ageChecks.productDescription,
    description: schema.ageChecks.description,
    notes: schema.ageChecks.notes,
    supersedesId: schema.ageChecks.supersedesId,
    checkedAt: schema.ageChecks.checkedAt,
    checkedByName: schema.users.name,
  })
    .from(schema.ageChecks)
    .innerJoin(schema.users, eq(schema.ageChecks.checkedByUserId, schema.users.id))
    .where(and(
      // The night runs to 04:00, so a refusal logged at 00:20 is still tonight's.
      gte(schema.ageChecks.checkedAt, showNightWindow(night).from),
      lte(schema.ageChecks.checkedAt, showNightWindow(night).to),
    ))
    .orderBy(desc(schema.ageChecks.checkedAt))

  return {
    night,
    accepted: rows.filter(r => r.outcome === 'ACCEPTED').length,
    refused: rows.filter(r => r.outcome === 'REFUSED').length,
    // Only refusals carry detail, so only they are worth listing.
    entries: rows.filter(r => r.outcome === 'REFUSED'),
  }
})
