// Deletes a term nothing has ever used (C-21). A term in use is refused: retire it instead.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { deleteTerm } from '../../../../../../vocabularies/service'

export default defineRoute({
  ability: 'core.vocabulary.manage',
  record: event => ['core.vocabulary', getRouterParam(event, 'key')],
  rateLimit: 'write',
  input: z.object({}),
}, async (event, { record }) => {
  const id = getRouterParam(event, 'id') ?? ''
  await deleteTerm(record!.id, id)
  return { id, deleted: true }
})
