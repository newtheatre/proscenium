// Adds productions to the end of a collection (C-60; CL1 on the statement).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { addToCollection } from '../../../../programme/collections'
import { collectionMembers } from '../../../../programme/input'

export default defineRoute({
  ability: 'core.collection.manage',
  record: event => ['core.collection', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: collectionMembers,
}, async (_event, { input, unit, record }) => {
  await addToCollection(unit, record!.id, input.productionIds)
  return { id: record!.id }
})
