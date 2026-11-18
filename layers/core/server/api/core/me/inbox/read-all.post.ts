// "Mark all read" in the inbox (C-30): every side the person has, or one of them.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { isMember } from '../../../../interface/viewer'
import { markAllRead, sidesOf } from '../../../../notifications/inbox'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'write',
  input: z.object({ side: z.enum(['all', 'audience', 'members']) }),
}, async (_event, { input, unit, actor }) => {
  markAllRead(unit, actor.accountId!, input.side === 'all' ? sidesOf(await isMember(actor)) : input.side)
  return { side: input.side }
})
