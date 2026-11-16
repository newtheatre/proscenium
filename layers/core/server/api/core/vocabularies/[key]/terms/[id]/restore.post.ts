// Brings a retired term back, unless a live term has taken its name meanwhile.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { restoreTerm } from '../../../../../../vocabularies/service'

export default defineRoute({
  ability: 'core.vocabulary.manage',
  record: event => ['core.vocabulary', getRouterParam(event, 'key')],
  rateLimit: 'write',
  input: z.object({}),
}, async (event, { unit, record }) => {
  const id = getRouterParam(event, 'id') ?? ''
  await restoreTerm(unit, record!.id, id)
  return { id }
})
