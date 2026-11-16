// Puts the terms in the order given: every term of the vocabulary, retired ones too (C-20).
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute, idSchema } from '#kit'
import { reorderTerms } from '../../../../vocabularies/service'

export default defineRoute({
  ability: 'core.vocabulary.manage',
  record: event => ['core.vocabulary', getRouterParam(event, 'key')],
  rateLimit: 'write',
  input: z.object({ ids: z.array(idSchema('trm')).min(1).max(500) }), // not-policy: matches core.units.set-rows-limit's default
}, async (_event, { input, unit, record }) => {
  await reorderTerms(unit, record!.id, input.ids)
  return { key: record!.id }
})
