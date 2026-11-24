// Puts a collection's productions in a new order; the list names every member once (C-60).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { orderCollection } from '../../../../programme/collections'
import { collectionMembers } from '../../../../programme/input'

export default defineRoute({
  ability: 'core.collection.manage',
  record: event => ['core.collection', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: collectionMembers,
}, async (_event, { input, unit, record }) => {
  await orderCollection(unit, record!.id, input.productionIds)
  return { id: record!.id }
})
