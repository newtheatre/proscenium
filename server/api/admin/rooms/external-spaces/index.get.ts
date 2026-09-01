import { z } from 'zod'

const query = z.object({
  search: z.string().trim().max(120).default(''),
  includeRetired: z.coerce.boolean().default(false),
})

// The SU catalogue, with every note against each room.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'rooms.read')
  const input = await getValidatedQueryOrThrow(event, query)

  const items = await searchSpaces(input.search, 200, input.includeRetired)
  const notes = await notesFor({ spaceIds: items.map(space => space.id) })

  return {
    items: items.map(space => ({ ...space, notes: notes.filter(note => note.spaceId === space.id) })),
    total: items.length,
  }
})
