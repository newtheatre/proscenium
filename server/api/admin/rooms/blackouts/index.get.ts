import { z } from 'zod'

const query = z.object({
  // Past blackouts stay readable, because a cancelled booking points at one.
  when: z.enum(['upcoming', 'all']).default('upcoming'),
})

// Rooms that are closed, and why.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'rooms.read')
  const input = await getValidatedQueryOrThrow(event, query)
  const items = await listBlackouts(input.when === 'upcoming' ? Math.floor(Date.now() / 1000) : 0)
  return { items, total: items.length }
})
