// Renames a vocabulary or changes how its terms are ordered.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { updateVocabulary } from '../../../../vocabularies/service'

export default defineRoute({
  ability: 'core.vocabulary.manage',
  record: event => ['core.vocabulary', getRouterParam(event, 'key')],
  rateLimit: 'write',
  input: z.object({
    label: z.string().trim().min(1).max(80).optional(), // not-policy: the label's bounds
    description: z.string().trim().max(300).nullable().optional(), // not-policy: the description's bound
    ordering: z.enum(['manual', 'alphabetical']).optional(),
  }),
}, async (_event, { input, unit, record }) => {
  await updateVocabulary(unit, record!.id, input)
  return { key: record!.id }
})
