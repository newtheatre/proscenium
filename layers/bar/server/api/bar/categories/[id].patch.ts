// Renames, recolours, retires or brings back a category.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { updateCategory } from '../../../catalogue'
import { categoryPatch } from '../../../input'

export default defineRoute({ ability: 'bar.product.manage', rateLimit: 'write', input: categoryPatch }, async (event, { input, unit }) => {
  await updateCategory(unit, getRouterParam(event, 'id')!, input)
  return { ok: true }
})
