import { db, schema } from '@nuxthub/db'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { workFoh } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  outcome: z.enum(schema.AGE_CHECK_OUTCOMES),
  performanceId: z.string().trim().min(1).optional(),
  reason: z.enum(schema.AGE_CHECK_REASONS).optional(),
  productDescription: z.string().trim().max(120).optional(),
  /** For the register, never a name (ADR-0027). */
  description: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(500).optional(),
  supersedesId: z.string().trim().min(1).optional(),
})

/**
 * POST /api/foh/age-checks: record an ID check. There is no update or delete
 * route, and the database refuses both (ADR-0027).
 */
export default defineEventHandler(async (event) => {
  await authorize(event, workFoh)

  const { user } = await requireUserSession(event)
  const scope = await requireFohScope(user)
  const input = await readValidatedBody(event, bodySchema.parse)

  if (input.performanceId) scopedPerformance(scope, input.performanceId)

  if (input.outcome === 'REFUSED' && !input.reason) {
    throw createError({ statusCode: 400, statusMessage: 'A refusal needs a reason for the register.' })
  }

  if (input.supersedesId) {
    const original = await db.select({ id: schema.ageChecks.id }).from(schema.ageChecks)
      .where(and(eq(schema.ageChecks.id, input.supersedesId))).get()
    if (!original) throw createError({ statusCode: 404, statusMessage: 'That entry does not exist.' })
  }

  // An accepted check is a bare tally: the ratio to refusals is the evidence
  // that Challenge 25 is operated rather than just displayed (docs/13 §4.2).
  const [row] = await db.insert(schema.ageChecks).values({
    performanceId: input.performanceId ?? null,
    checkedByUserId: user.id,
    outcome: input.outcome,
    reason: input.outcome === 'REFUSED' ? input.reason ?? null : null,
    productDescription: input.outcome === 'REFUSED' ? input.productDescription ?? null : null,
    description: input.outcome === 'REFUSED' ? input.description ?? null : null,
    notes: input.outcome === 'REFUSED' ? input.notes ?? null : null,
    supersedesId: input.supersedesId ?? null,
    checkedAt: new Date(),
  }).returning()

  return row
})
