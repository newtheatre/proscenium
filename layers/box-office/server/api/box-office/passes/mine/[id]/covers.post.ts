// Uses one of the signed-in person's passes for tickets they already have (Matt, 19 November): each
// becomes the pass's entry in the same seat, with the same ticket, and is no longer to be paid for.
import { z } from 'zod'
import { getRouterParam } from 'nuxt/server'
import { defineRoute, idSchema } from '#kit'
import { coverWithPass, ownPass } from '../../../../../pass-covers'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({ lineIds: z.array(idSchema('orl')).min(1).max(50) }).strict(), // not-policy: more tickets than one person holds
}, async (event, { input, unit, actor }) => {
  const passId = await ownPass(getRouterParam(event, 'id', { decode: true })!, actor.accountId!)
  return coverWithPass(unit.view(), passId, input.lineIds, actor.accountId!)
})
