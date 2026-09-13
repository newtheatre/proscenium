import { z } from 'zod'

const query = z.object({ q: z.string().trim().min(1).max(200) })

// H-924: a session for the announce composer's audience picker, searched rather than typed.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'comms.announce')
  const input = await getValidatedQueryOrThrow(event, query)
  return { items: await announceSessions(input.q) }
})
