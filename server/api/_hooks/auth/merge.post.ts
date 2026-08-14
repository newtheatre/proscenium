import { z } from 'zod/v4'

const bodySchema = z.object({
  fromUserId: z.string().min(1),
  toUserId: z.string().min(1),
  dryRun: z.boolean().optional(),
})

/**
 * POST /api/_hooks/auth/merge — account merge, this app's share
 * (stage-door ADR-0015). Delegates to mergeUser, which re-points every
 * user-referencing column onto the winner and deletes the losing mirror
 * row. `dryRun: true` returns the affected-row counts without writing —
 * stage-door shows them in its pre-merge report. Idempotent.
 */
export default defineEventHandler(async (event) => {
  requireHookAuth(event)
  const { fromUserId, toUserId, dryRun } = await readValidatedBody(event, bodySchema.parse)

  if (fromUserId === toUserId) {
    throw createError({ statusCode: 400, statusMessage: 'fromUserId and toUserId must differ' })
  }

  return mergeUser(fromUserId, toUserId, dryRun ?? false)
})
