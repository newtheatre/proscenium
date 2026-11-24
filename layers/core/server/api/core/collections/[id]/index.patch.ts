// Changes a collection's name, address, summary, page, colour or season (C-60; CL1).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { updateCollection } from '../../../../programme/collections'
import { collectionPatch } from '../../../../programme/input'

export default defineRoute({
  ability: 'core.collection.manage',
  record: event => ['core.collection', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: collectionPatch,
}, async (_event, { input, unit, record }) => {
  await updateCollection(unit, record!.id, input)
  return { id: record!.id }
})
