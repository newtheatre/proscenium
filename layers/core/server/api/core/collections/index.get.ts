// Collections for the console (C-60): one season's or all, with how many productions each holds, drafts included (CL3).
import { z } from 'zod'
import { defineRoute } from '#kit'
import { listCollections } from '../../../programme/collections'

export default defineRoute({
  ability: 'core.production.view',
  rateLimit: 'default',
  input: z.object({ seasonId: z.string().optional(), state: z.enum(['draft', 'published', 'archived']).optional() }),
}, async (_event, { input }) => ({ collections: await listCollections(input) }))
