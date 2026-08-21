import { db, schema } from '@nuxthub/db'
import { and, asc, eq, gte, lte } from 'drizzle-orm'
import { z } from 'zod'
import { manageBar } from '~~/shared/utils/abilities'

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

const REASONS: Record<string, string> = {
  NO_ID: 'No ID',
  ID_NOT_ACCEPTED: 'ID not accepted',
  UNDER_25_NO_ID: 'Under 25, no ID',
  INTOXICATED: 'Intoxicated',
  PROXY: 'Proxy purchase',
  OTHER: 'Other',
}

/** GET /api/admin/bar/reports/age-checks.pdf — the register, for a licensing visit. */
export default defineEventHandler(async (event) => {
  await authorize(event, manageBar)

  const { from, to } = await getValidatedQuery(event, querySchema.parse)

  const rows = await db.select({
    checkedAt: schema.ageChecks.checkedAt,
    outcome: schema.ageChecks.outcome,
    reason: schema.ageChecks.reason,
    description: schema.ageChecks.description,
    staff: schema.users.name,
    showTitle: schema.shows.title,
  })
    .from(schema.ageChecks)
    .leftJoin(schema.users, eq(schema.ageChecks.checkedByUserId, schema.users.id))
    .leftJoin(schema.performances, eq(schema.ageChecks.performanceId, schema.performances.id))
    .leftJoin(schema.shows, eq(schema.performances.showId, schema.shows.id))
    .where(and(
      gte(schema.ageChecks.checkedAt, validityStart(from)),
      lte(schema.ageChecks.checkedAt, validityEnd(to)),
    ))
    .orderBy(asc(schema.ageChecks.checkedAt))

  const accepted = rows.filter(r => r.outcome === 'ACCEPTED').length
  const refused = rows.length - accepted

  const pdf = tablePdf(
    'Challenge 25 register',
    `The Nottingham New Theatre  |  ${from} to ${to}  |  ${accepted} accepted, ${refused} refused`,
    [
      { header: 'When', width: 95 },
      { header: 'Outcome', width: 65 },
      { header: 'Reason', width: 95 },
      { header: 'Detail', width: 130 },
      { header: 'Staff', width: 90 },
    ],
    rows.map(row => [
      formatRegisterStamp(row.checkedAt),
      row.outcome === 'ACCEPTED' ? 'Accepted' : 'Refused',
      row.reason ? REASONS[row.reason] ?? row.reason : '',
      row.description ?? row.showTitle ?? '',
      row.staff ?? 'Unknown',
    ]),
  )

  setHeader(event, 'content-type', 'application/pdf')
  setHeader(event, 'content-disposition', `attachment; filename="challenge-25-register-${from}-to-${to}.pdf"`)
  return pdf
})
