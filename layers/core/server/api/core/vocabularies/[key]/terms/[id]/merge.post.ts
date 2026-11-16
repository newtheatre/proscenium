// Merges a term into another of the same vocabulary: the first is retired and reads follow it to
// the second, so reports group the two and no record is rewritten.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute, idSchema } from '#kit'
import { mergeTerm } from '../../../../../../vocabularies/service'

export default defineRoute({
  ability: 'core.vocabulary.manage',
  record: event => ['core.vocabulary', getRouterParam(event, 'key')],
  rateLimit: 'write',
  input: z.object({ into: idSchema('trm') }),
}, async (event, { input, unit, record }) => {
  const id = getRouterParam(event, 'id') ?? ''
  await mergeTerm(unit, record!.id, id, input.into)
  return { id, into: input.into }
})
