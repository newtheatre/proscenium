// A theatre's own vocabulary, keyed x.<name> (group 3).
import { z } from 'zod'
import { defineRoute } from '#kit'
import { createVocabulary } from '../../../vocabularies/service'

export default defineRoute({
  ability: 'core.vocabulary.manage',
  rateLimit: 'write',
  input: z.object({
    label: z.string().trim().min(1).max(80), // not-policy: the label's bounds
    description: z.string().trim().max(300).nullable().optional(), // not-policy: the description's bound
    ordering: z.enum(['manual', 'alphabetical']).optional(),
  }),
}, async (_event, { input, unit }) => {
  return { key: await createVocabulary(unit, input) }
})
