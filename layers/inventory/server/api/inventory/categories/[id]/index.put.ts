// Changes a category. Kinds added fall due for its items; kinds taken off leave them (N1).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { categoryRow, updateCategory } from '../../../../departments'
import { categoryInput } from '../../../../inputs'

export default defineRoute({
  ability: 'inventory.setup.manage',
  rateLimit: 'write',
  idempotent: true,
  input: categoryInput.omit({ departmentId: true }),
}, async (event, { input, unit }) => {
  await updateCategory(unit.view(), await categoryRow(getRouterParam(event, 'id')!), input)
  return { categoryId: getRouterParam(event, 'id') }
})
