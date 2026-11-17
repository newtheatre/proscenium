// Adds a category, last on the till.
import { defineRoute } from '#kit'
import { addCategory } from '../../../catalogue'
import { categoryInput } from '../../../input'

export default defineRoute({ ability: 'bar.product.manage', rateLimit: 'write', input: categoryInput }, async (_event, { input, unit }) => ({ categoryId: addCategory(unit, input) }))
