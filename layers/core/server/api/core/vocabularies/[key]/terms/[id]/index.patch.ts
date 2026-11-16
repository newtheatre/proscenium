// Renames a term or changes its description or icon (C-20). Records hold the id, so every one
// shows the new label at once and none is rewritten.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { updateTerm } from '../../../../../../vocabularies/service'

export default defineRoute({
  ability: 'core.vocabulary.manage',
  record: event => ['core.vocabulary', getRouterParam(event, 'key')],
  rateLimit: 'write',
  input: z.object({
    label: z.string().trim().min(1).max(80).optional(), // not-policy: the label's bounds
    description: z.string().trim().max(300).nullable().optional(), // not-policy: the description's bound
    icon: z.string().regex(/^i-[a-z0-9-]+$/).nullable().optional(), // not-policy: an icon name's pattern
  }),
}, async (event, { input, unit, record }) => {
  const id = getRouterParam(event, 'id') ?? ''
  await updateTerm(unit, record!.id, id, input)
  return { id }
})
