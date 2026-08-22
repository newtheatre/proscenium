import { db, schema } from '@nuxthub/db'
import { and, asc, eq, gte, lte } from 'drizzle-orm'
import { z } from 'zod'
import { manageBar } from '~~/shared/utils/abilities'

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

/** GET /api/admin/bar/age-checks/export — the register as CSV, for a date range. */
export default defineEventHandler(async (event) => {
  await authorize(event, manageBar)

  const { from, to } = await getValidatedQuery(event, querySchema.parse)

  const rows = await db.select({
    checkedAt: schema.ageChecks.checkedAt,
    outcome: schema.ageChecks.outcome,
    reason: schema.ageChecks.reason,
    productDescription: schema.ageChecks.productDescription,
    description: schema.ageChecks.description,
    notes: schema.ageChecks.notes,
    supersedesId: schema.ageChecks.supersedesId,
    staff: schema.users.name,
    showTitle: schema.shows.title,
  })
    .from(schema.ageChecks)
    .innerJoin(schema.users, eq(schema.ageChecks.checkedByUserId, schema.users.id))
    .leftJoin(schema.performances, eq(schema.ageChecks.performanceId, schema.performances.id))
    .leftJoin(schema.shows, eq(schema.performances.showId, schema.shows.id))
    .where(and(
      gte(schema.ageChecks.checkedAt, validityStart(from)),
      lte(schema.ageChecks.checkedAt, validityEnd(to)),
    ))
    .orderBy(asc(schema.ageChecks.checkedAt))

  // The shared CSV helpers: this file's own copy escaped \r differently, so a
  // pasted note with CRLF line endings broke only this export.
  return sendCsv(event, `challenge-25-${from}-to-${to}.csv`, toCsv(
    ['Date', 'Time', 'Outcome', 'Reason', 'Asked for', 'Description', 'Notes', 'Staff', 'Performance', 'Corrects'],
    rows.map(r => [
      formatRegisterStamp(r.checkedAt).split(',')[0], formatRegisterStamp(r.checkedAt).split(', ')[1],
      r.outcome, r.reason, r.productDescription,
      r.description, r.notes, r.staff, r.showTitle, r.supersedesId,
    ]),
  ))
})
