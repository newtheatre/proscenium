// Adds a category, last on the till; under a top-level category when a parent is named.
import { defineRoute } from '#kit'
import { addCategory, checkParent } from '../../../catalogue'
import { categoryInput } from '../../../input'
import { checkUsualPreset } from '../../../presets'

export default defineRoute({ ability: 'bar.product.manage', rateLimit: 'write', input: categoryInput }, async (_event, { input, unit }) => {
  await checkParent(null, input.parentId ?? null)
  await checkUsualPreset(input.usualPreset)
  return { categoryId: addCategory(unit, input) }
})
