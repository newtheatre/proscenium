import { z } from 'zod'

const query = z.object({
  // Members see the active estate; an officer describing it needs to see what was retired too.
  includeInactive: z.coerce.boolean().default(false),
})

// The bookable estate, and the estate-wide numbers each room falls back to.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'rooms.read')
  const input = await getValidatedQueryOrThrow(event, query)

  const items = await listRooms(input.includeInactive)
  // Sent with the rooms so the editor can show what a blank override would mean, rather than
  // asking somebody to hold the settings screen in their head (C-106 criterion 4).
  return { items, total: items.length, estate: await estatePolicy(event) }
})
