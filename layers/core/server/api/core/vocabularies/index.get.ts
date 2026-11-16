// Every vocabulary, with how many live and retired terms each has (C-20). Answers the console's
// list shape, { rows, total }; there are tens, not thousands, so it filters in memory.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { listVocabularies } from '../../../vocabularies/service'

export default defineRoute({
  ability: 'core.vocabulary.manage',
  rateLimit: 'default',
  input: z.object({
    q: z.string().optional(),
    owner: z.string().optional(),
    sort: z.string().optional(),
    order: z.enum(['asc', 'desc']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    size: z.coerce.number().int().min(1).max(100).default(25), // not-policy: the console list's page sizes
  }),
}, async (_event, { input }) => {
  const q = input.q?.trim().toLowerCase()
  const found = (await listVocabularies()).filter(v => (!q || v.label.toLowerCase().includes(q)) && (!input.owner || v.owner === input.owner))
  if (input.sort === 'label') found.sort((a, b) => a.label.localeCompare(b.label) * (input.order === 'desc' ? -1 : 1))
  return { rows: found.slice((input.page - 1) * input.size, input.page * input.size), total: found.length }
})
