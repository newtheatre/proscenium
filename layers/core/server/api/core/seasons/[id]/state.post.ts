// Publishes, archives or returns a season to draft (part 3).
import { z } from 'zod'
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { moveSeason } from '../../../../programme/service'

export default defineRoute({
  ability: 'core.season.manage',
  rateLimit: 'write',
  input: z.object({ to: z.enum(['draft', 'published', 'archived']) }),
}, async (event, { input, unit }) => {
  const id = getRouterParam(event, 'id', { decode: true }) ?? ''
  await moveSeason(unit, id, input.to)
  return { id, state: input.to }
})
