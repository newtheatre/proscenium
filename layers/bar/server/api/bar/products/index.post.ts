// Adds a product with its first size ("Each" unless named) and, when given, its Standard price.
import { defineRoute } from '#kit'
import { addProduct } from '../../../catalogue'
import { productInput } from '../../../input'

export default defineRoute({ ability: 'bar.product.manage', rateLimit: 'write', input: productInput }, async (_event, { input, actor, unit }) => {
  const { variantName, amountMinor, ...product } = input
  return await addProduct(unit, product, { name: variantName, amountMinor }, actor.accountId!)
})
