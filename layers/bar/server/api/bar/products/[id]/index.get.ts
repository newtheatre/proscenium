// One product for its page (S11): its sizes with their prices on every list, the categories it may
// move to, the choices it may ask, and whether the viewer may set prices and record allergens as well.
import { getRouterParam } from 'h3'
import { can, defineRoute, refuse } from '#kit'
import { catalogue } from '../../../../catalogue'
import { choiceGroups } from '../../../../choices'

export default defineRoute({
  ability: 'bar.product.manage',
  record: event => ['bar.product', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (_event, { record, actor }) => {
  const { categories, lists, currency } = await catalogue()
  const product = categories.flatMap(c => c.products).find(p => p.id === record!.id)
  if (!product) refuse('core.not-found', 'There is no such product.', { status: 404 })
  return {
    product,
    categories: categories.filter(c => c.active || c.id === product!.categoryId).map(c => ({ id: c.id, name: c.name })),
    lists: lists.filter(l => l.active),
    currency,
    groups: (await choiceGroups()).filter(g => g.active || product!.groupIds.includes(g.id)).map(g => ({ id: g.id, name: g.name })),
    canPrice: (await can(actor, 'bar.price.manage')).allowed,
    canAllergens: (await can(actor, 'bar.allergens.manage')).allowed,
  }
})
