// Deletes a draft collection that has never been public, with its memberships (C-60).
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { deleteCollection } from '../../../../programme/collections'

export default defineRoute({
  ability: 'core.collection.manage',
  record: event => ['core.collection', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({}),
}, async (_event, { unit, record }) => {
  await deleteCollection(unit, record!.id)
  return { id: record!.id }
})
