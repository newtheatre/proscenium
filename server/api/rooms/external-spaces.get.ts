import { noteFor, warningFor } from '#shared/utils/external-spaces'
import { z } from 'zod'

const query = z.object({
  search: z.string().trim().max(120).default(''),
  // What the member wants the room for, so each result can say whether it suits (C-119).
  purpose: z.string().trim().max(32).optional(),
  limit: z.coerce.number().int().positive().max(25).default(10),
})

// Search the rooms the SU manages, with what we know about each for a given purpose.
export default defineEventHandler(async (event) => {
  await requireAccount(event)
  const input = await getValidatedQueryOrThrow(event, query)

  const spaces = await searchSpaces(input.search, input.limit)
  const notes = await notesFor({ spaceIds: spaces.map(space => space.id), purpose: input.purpose })

  return {
    items: spaces.map((space) => {
      const note = noteFor(notes, space.id, input.purpose ?? null)
      return {
        id: space.id,
        name: space.name,
        campus: space.campus,
        building: space.building,
        capacity: space.capacity,
        verdict: note?.verdict ?? null,
        warning: warningFor(note),
      }
    }),
    total: spaces.length,
  }
})
