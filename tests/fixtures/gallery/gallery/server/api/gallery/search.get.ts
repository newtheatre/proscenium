// A sample search source for the command palette: ids of the productions whose name holds the words.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { productions } from '../../productions'

export default defineRoute({
  ability: 'gallery.sample.view',
  rateLimit: 'default',
  input: z.object({ q: z.string().max(100) }),
}, async (_event, { input }) => ({ ids: productions.filter(p => p.name.toLowerCase().includes(input.q.toLowerCase())).slice(0, 5).map(p => p.id) })) // not-policy: sample data
