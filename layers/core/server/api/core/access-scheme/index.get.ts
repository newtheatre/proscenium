// The reviewers' queue (ID-40): open applications and changes, oldest first, with the person's name
// and how long each has waited. No needs are shown until one is opened. Answers the console's list
// shape, { rows, total }; a queue is tens long, so it filters in memory.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { reviewQueue } from '../../../identity/access-scheme'

export default defineRoute({
  ability: 'core.access-scheme.read',
  rateLimit: 'default',
  input: z.object({
    q: z.string().optional(),
    kind: z.enum(['new', 'change']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    size: z.coerce.number().int().min(1).max(100).default(25), // not-policy: the console list's page sizes
  }),
}, async (_event, { input }) => {
  const q = input.q?.trim().toLowerCase()
  const found = (await reviewQueue()).filter(a => (!q || (a.name ?? '').toLowerCase().includes(q)) && (!input.kind || (input.kind === 'change') === a.change))
  return { rows: found.slice((input.page - 1) * input.size, input.page * input.size), total: found.length }
})
