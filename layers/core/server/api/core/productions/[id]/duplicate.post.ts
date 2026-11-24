// Starts a new draft from a production (C-01): its details and guidance, without its dates, credits or images.
import { z } from 'zod'
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { duplicateProduction } from '../../../../programme/service'

export default defineRoute({
  ability: 'core.production.create',
  rateLimit: 'write',
  input: z.object({}),
}, async (event, { unit, actor }) => {
  return { id: await duplicateProduction(unit, getRouterParam(event, 'id', { decode: true })!, actor.accountId ?? null) }
})
