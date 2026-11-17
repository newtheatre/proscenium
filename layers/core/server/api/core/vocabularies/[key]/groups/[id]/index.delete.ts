// Removes an empty heading (C-54).
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { removeTermGroup } from '../../../../../../vocabularies/service'

export default defineRoute({
  ability: 'core.vocabulary.manage',
  record: event => ['core.vocabulary', getRouterParam(event, 'key')],
  rateLimit: 'write',
  input: z.object({}),
}, async (event, { unit, record }) => {
  const id = getRouterParam(event, 'id') ?? ''
  await removeTermGroup(unit, record!.id, id)
  return { id }
})
