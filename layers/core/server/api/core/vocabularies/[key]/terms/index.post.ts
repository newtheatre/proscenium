// Adds a term (C-20). Refused when a live term of the vocabulary has the label, ignoring case.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { addTerm } from '../../../../../vocabularies/service'

export default defineRoute({
  ability: 'core.vocabulary.manage',
  record: event => ['core.vocabulary', getRouterParam(event, 'key')],
  rateLimit: 'write',
  input: z.object({
    label: z.string().trim().min(1).max(80), // not-policy: the label's bounds
    description: z.string().trim().max(300).nullable().optional(), // not-policy: the description's bound
    icon: z.string().regex(/^i-[a-z0-9-]+$/).nullable().optional(), // not-policy: an icon name's pattern
  }),
}, async (_event, { input, unit, record }) => {
  return { id: await addTerm(unit, record!.id, input) }
})
