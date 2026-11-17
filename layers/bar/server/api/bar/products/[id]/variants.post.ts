// Adds a size to a product, with its Standard price when given.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { addVariant } from '../../../../catalogue'
import { variantInput } from '../../../../input'

export default defineRoute({
  ability: 'bar.product.manage',
  record: event => ['bar.product', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: variantInput,
}, async (_event, { input, record, actor, unit }) => {
  const { amountMinor, ...variant } = input
  return { variantId: await addVariant(unit, record!.id, variant, amountMinor, actor.accountId!) }
})
