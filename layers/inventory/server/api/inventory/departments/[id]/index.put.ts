// Changes a kit department. A new tag prefix applies to items added from now on (I3).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { departmentRow, updateDepartment } from '../../../../departments'
import { departmentInput } from '../../../../inputs'

export default defineRoute({
  ability: 'inventory.setup.manage',
  rateLimit: 'write',
  idempotent: true,
  input: departmentInput,
}, async (event, { input, unit }) => {
  updateDepartment(unit.view(), await departmentRow(getRouterParam(event, 'id')!), input)
  return { departmentId: getRouterParam(event, 'id') }
})
