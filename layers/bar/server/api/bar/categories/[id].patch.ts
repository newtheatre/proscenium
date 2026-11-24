// Renames, recolours, retires or brings back a category, or changes what its products usually are.
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { updateCategory } from '../../../catalogue'
import { checkUsualPreset } from '../../../presets'
import { categoryPatch } from '../../../input'

export default defineRoute({ ability: 'bar.product.manage', rateLimit: 'write', input: categoryPatch }, async (event, { input, unit }) => {
  await checkUsualPreset(input.usualPreset)
  await updateCategory(unit, getRouterParam(event, 'id', { decode: true })!, input)
  return { ok: true }
})
