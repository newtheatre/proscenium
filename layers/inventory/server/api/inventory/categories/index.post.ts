// Adds a category to a kit department, with the inspection kinds its items need (INV-06, N1).
import { defineRoute } from '#kit'
import { addCategory } from '../../../departments'
import { categoryInput } from '../../../inputs'

export default defineRoute({
  ability: 'inventory.setup.manage',
  rateLimit: 'write',
  idempotent: true,
  input: categoryInput,
}, async (_event, { input, unit }) => ({ categoryId: await addCategory(unit.view(), input) }))
