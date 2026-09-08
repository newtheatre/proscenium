import { z } from 'zod'

const query = z.object({ venueId: z.string().min(1), includeRetired: z.coerce.boolean().optional() })

// Every checklist item at a venue, for the committee's own editing screen (E-114 criterion 1).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'checklist.read')
  const { venueId, includeRetired } = await getValidatedQueryOrThrow(event, query)
  return { items: await itemsForVenue(venueId, includeRetired ?? false) }
})
