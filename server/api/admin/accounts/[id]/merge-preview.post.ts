import { z } from 'zod'

const body = z.object({ winnerId: z.string().min(1) })

// Dry run: exactly what a merge would move, and any reason it would refuse (A-123 criterion 1).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'accounts.merge')
  const loserId = getRouterParam(event, 'id') ?? ''
  const input = await readValidatedBodyOrThrow(event, body)

  if (owns(resolved, loserId)) {
    throw createError({ statusCode: 409, statusMessage: 'That is your own account' })
  }

  return await previewMerge(input.winnerId, loserId)
})
