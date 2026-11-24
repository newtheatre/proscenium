// Puts a grouped vocabulary's headings in the order given (C-54).
import { z } from 'zod'
import { getRouterParam } from 'nuxt/server'
import { defineRoute, idSchema } from '#kit'
import { reorderTermGroups } from '../../../../../vocabularies/service'

export default defineRoute({
  ability: 'core.vocabulary.manage',
  record: event => ['core.vocabulary', getRouterParam(event, 'key', { decode: true })],
  rateLimit: 'write',
  input: z.object({ ids: z.array(idSchema('tgr')).min(1).max(100) }), // not-policy: a sane ceiling on headings
}, async (_event, { input, unit, record }) => {
  await reorderTermGroups(unit, record!.id, input.ids)
  return { key: record!.id }
})
