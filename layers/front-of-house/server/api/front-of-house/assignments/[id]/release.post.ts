// The person gives up their place: withdrawn, released, or asking for cover inside the notice (FH-13).
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { releasePlace } from '../../../../people'

export default defineRoute({
  ability: 'front-of-house.shift.sign-up',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({ reason: z.string().trim().max(300).nullish() }).strict(), // not-policy: shape bound, as the table's CHECK
}, (event, { input, actor, unit }) => releasePlace(unit.view(), getRouterParam(event, 'id', { decode: true })!, { accountId: actor.accountId!, reason: input.reason }))
