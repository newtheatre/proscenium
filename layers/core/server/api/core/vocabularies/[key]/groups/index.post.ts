// Adds a heading to a grouped vocabulary (C-54).
import { z } from 'zod'
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { addTermGroup } from '../../../../../vocabularies/service'

export default defineRoute({
  ability: 'core.vocabulary.manage',
  record: event => ['core.vocabulary', getRouterParam(event, 'key', { decode: true })],
  rateLimit: 'write',
  input: z.object({ label: z.string().trim().min(1).max(80) }), // not-policy: the label's bounds
}, async (_event, { input, unit, record }) => {
  return { id: await addTermGroup(unit, record!.id, input.label) }
})
