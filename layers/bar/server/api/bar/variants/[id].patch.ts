// Renames a size, sets its barcode, or retires it. A product on sale keeps at least one size.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { updateVariant } from '../../../catalogue'
import { variantPatch } from '../../../input'

export default defineRoute({ ability: 'bar.product.manage', rateLimit: 'write', input: variantPatch }, async (event, { input, unit }) => {
  await updateVariant(unit, getRouterParam(event, 'id')!, input)
  return { ok: true }
})
