// Adds a kit department with its tag prefix and who it lends to (INV-05).
import { defineRoute } from '#kit'
import { addDepartment } from '../../../departments'
import { departmentInput } from '../../../inputs'

export default defineRoute({
  ability: 'inventory.setup.manage',
  rateLimit: 'write',
  idempotent: true,
  input: departmentInput,
}, (_event, { input, unit }) => ({ departmentId: addDepartment(unit.view(), input) }))
