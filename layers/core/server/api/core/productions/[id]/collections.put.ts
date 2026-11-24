// The collections a production is in, chosen all at once on its record (C-60). Each change needs
// core.collection.manage on that collection as well as edit on the production.
import { getRouterParam } from 'h3'
import { defineRoute, requireAbility } from '#kit'
import { setProductionCollections } from '../../../../programme/collections'
import { productionCollections } from '../../../../programme/input'

export default defineRoute({
  ability: 'core.production.edit',
  record: event => ['core.production', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: productionCollections,
}, async (_event, { input, unit, record, actor }) => {
  const changed = await setProductionCollections(unit, record!.id, input.collectionIds)
  for (const id of changed) await requireAbility(actor, 'core.collection.manage', ['core.collection', id])
  return { id: record!.id }
})
