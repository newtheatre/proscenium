import { z } from 'zod'

const query = z.object({
  // Members see the active estate; an officer describing it needs to see what was retired too.
  includeInactive: z.coerce.boolean().default(false),
})

// The bookable estate.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'rooms.read')
  const input = await getValidatedQueryOrThrow(event, query)

  const items = await listRooms(input.includeInactive)
  return { items, total: items.length }
})
