// Changes a product, or retires it. A product that has been sold is retired, never deleted.
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { updateProduct } from '../../../../catalogue'
import { productPatch } from '../../../../input'

export default defineRoute({
  ability: 'bar.product.manage',
  record: event => ['bar.product', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: productPatch,
}, async (_event, { input, record, unit }) => {
  await updateProduct(unit, record!.id, input)
  return { ok: true }
})
