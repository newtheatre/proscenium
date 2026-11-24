// Archives a message, or brings it back with { archived: false } (the toast's Undo).
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { assertOwnItem, setArchived } from '../../../../../notifications/inbox'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'write',
  input: z.object({ archived: z.boolean().default(true) }),
}, async (event, { input, unit, actor }) => {
  const id = getRouterParam(event, 'id', { decode: true })!
  await assertOwnItem(actor.accountId!, id)
  setArchived(unit, actor.accountId!, id, input.archived)
  return { id, archived: input.archived }
})
