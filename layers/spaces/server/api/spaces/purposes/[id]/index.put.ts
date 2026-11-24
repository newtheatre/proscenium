// Changes a purpose. Bookings already made keep their priority (rule L6).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { purposeRow, updatePurpose } from '../../../../setup'
import { purposeInput } from '../../../../inputs'

export default defineRoute({
  ability: 'spaces.purpose.manage',
  rateLimit: 'write',
  idempotent: true,
  input: purposeInput,
}, async (event, { input, unit }) => {
  updatePurpose(unit.view(), await purposeRow(getRouterParam(event, 'id')!), input)
  return { purposeId: getRouterParam(event, 'id') }
})
