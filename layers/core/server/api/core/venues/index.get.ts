// Venues with their spaces nested (C-16), for the console's Venues screen. Answers the console's
// list shape, { rows, total }; there are a handful, not thousands, so it filters in memory.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { listVenues } from '../../../places/service'

export default defineRoute({
  ability: 'core.venue.manage',
  rateLimit: 'default',
  input: z.object({
    q: z.string().optional(),
    state: z.enum(['active', 'archived']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    size: z.coerce.number().int().min(1).max(100).default(25), // not-policy: the console list's page sizes
  }),
}, async (_event, { input }) => {
  const q = input.q?.trim().toLowerCase()
  const found = (await listVenues({ archived: true }))
    .filter(v => (input.state === 'archived' ? v.archived : !v.archived))
    .filter(v => !q || v.name.toLowerCase().includes(q) || v.spaces.some(s => s.name.toLowerCase().includes(q)))
  return { rows: found.slice((input.page - 1) * input.size, input.page * input.size), total: found.length }
})
