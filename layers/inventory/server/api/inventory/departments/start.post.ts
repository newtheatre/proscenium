// Makes the starting departments, only while there are none (spec part 6).
import { z } from 'zod'
import { defineRoute } from '#kit'
import { startDepartments } from '../../../departments'

export default defineRoute({
  ability: 'inventory.setup.manage',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({}).strict(),
}, (_event, { unit }) => ({ made: startDepartments(unit.view()) }))
