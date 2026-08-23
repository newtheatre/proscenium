import { z } from 'zod'
import { AGE_CHECK_OUTCOMES, AGE_CHECK_REASONS } from '~~/server/db/schema/ageChecks'

const bodySchema = z.object({
  outcome: z.enum(AGE_CHECK_OUTCOMES),
  reason: z.enum(AGE_CHECK_REASONS).optional(),
  productDescription: z.string().trim().max(120).optional(),
  description: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(500).optional(),
  supersedesId: z.string().trim().min(1).optional(),
})

/**
 * POST /api/training/foh/age-checks: practise the register. The real one is
 * append-only and this never touches it (ADR-0027, ADR-0032).
 */
export default defineEventHandler(async (event) => {
  const { run } = await requireRun(event, 'challenge-25')
  const input = await readValidatedBody(event, bodySchema.parse)

  // The rule worth learning: a refusal without a reason is not a register entry.
  if (input.outcome === 'REFUSED' && !input.reason) {
    throw createError({ statusCode: 400, statusMessage: 'A refusal needs a reason for the register.' })
  }

  // Corrections point at this run's own entries, never a real register id.
  if (input.supersedesId) {
    const own = await eventsFor(run.id)
    if (!own.some(item => item.id === input.supersedesId)) {
      throw createError({ statusCode: 404, statusMessage: 'That entry does not exist.' })
    }
  }

  await recordEvent(run.id, 'AGE_CHECK', {
    outcome: input.outcome,
    reason: input.outcome === 'REFUSED' ? input.reason ?? null : null,
    productDescription: input.outcome === 'REFUSED' ? input.productDescription ?? null : null,
    description: input.outcome === 'REFUSED' ? input.description ?? null : null,
    supersedesId: input.supersedesId ?? null,
  })

  return { outcome: input.outcome, recorded: true }
})
