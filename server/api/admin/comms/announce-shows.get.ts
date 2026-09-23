import { z } from 'zod'

const query = z.object({ q: z.string().trim().min(1).max(200) })

// A show and its performances for the announce composer's ticket-holder audiences, searched by title.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'comms.announce')
  const input = await getValidatedQueryOrThrow(event, query)
  return { items: await announceShows(input.q) }
})
