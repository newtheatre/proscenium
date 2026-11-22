// Productions for the console (C-01): filter by state, season and category, search by title or company.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { listProductions } from '../../../programme/service'

export default defineRoute({
  ability: 'core.production.view',
  rateLimit: 'default',
  input: z.object({
    q: z.string().optional(),
    state: z.enum(['draft', 'published', 'withdrawn', 'cancelled']).optional(),
    seasonId: z.string().optional(),
    categoryTermId: z.string().optional(),
    // The console list's tabs. Without one the list is as it always was: everything, newest made first.
    view: z.enum(['coming-up', 'drafts', 'past', 'all']).optional(),
    sort: z.enum(['title', 'next', 'dates']).optional(),
    order: z.enum(['asc', 'desc']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    size: z.coerce.number().int().min(1).max(100).default(25), // not-policy: the console list's page sizes
  }),
}, async (_event, { input }) => {
  return await listProductions(input)
})
