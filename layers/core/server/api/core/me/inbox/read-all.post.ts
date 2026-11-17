// "Mark all read" on one side of the inbox (C-30).
import { z } from 'zod'
import { defineRoute } from '#kit'
import { markAllRead } from '../../../../notifications/inbox'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'write',
  input: z.object({ side: z.enum(['audience', 'members']) }),
}, async (_event, { input, unit, actor }) => {
  markAllRead(unit, actor.accountId!, input.side)
  return { side: input.side }
})
