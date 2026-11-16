// Seasons, newest first, with how many productions each has.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { listSeasons } from '../../../programme/service'

export default defineRoute({
  ability: 'core.production.view',
  rateLimit: 'default',
  input: z.object({ page: z.coerce.number().int().min(1).default(1), size: z.coerce.number().int().min(1).max(100).default(25) }), // not-policy: the console list's page sizes
}, async (_event, { input }) => {
  const all = await listSeasons()
  return { rows: all.slice((input.page - 1) * input.size, input.page * input.size), total: all.length }
})
