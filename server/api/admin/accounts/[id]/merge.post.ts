import { z } from 'zod'

const body = z.object({ winnerId: z.string().min(1), confirmEmail: z.string().trim().min(1) })

// Executes a merge: the losing account's own email typed back is the confirmation (A-123
// criterion 2), checked again here since a dry run can be stale by the time this runs.
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'accounts.merge')
  const loserId = getRouterParam(event, 'id') ?? ''
  const input = await readValidatedBodyOrThrow(event, body)

  if (owns(resolved, loserId)) {
    throw createError({ statusCode: 409, statusMessage: 'That is your own account' })
  }

  return await executeMerge(input.winnerId, loserId, resolved.account.id, input.confirmEmail)
})
