// Archives a kit department, or brings it back. One with active categories stays (I8).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { departmentRow, setDepartmentState } from '../../../../departments'
import { stateInput } from '../../../../inputs'

export default defineRoute({ ability: 'inventory.setup.manage', rateLimit: 'write', idempotent: true, input: stateInput }, async (event, { input, unit }) => {
  setDepartmentState(unit.view(), await departmentRow(getRouterParam(event, 'id')!), input.to)
  return { state: input.to }
})
