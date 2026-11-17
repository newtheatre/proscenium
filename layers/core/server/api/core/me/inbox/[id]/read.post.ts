// Opening a message marks it read (C-30).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { assertOwnItem, markRead } from '../../../../../notifications/inbox'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', input: z.object({}) }, async (event, { unit, actor }) => {
  const id = getRouterParam(event, 'id')!
  await assertOwnItem(actor.accountId!, id)
  markRead(unit, actor.accountId!, id)
  return { id }
})
