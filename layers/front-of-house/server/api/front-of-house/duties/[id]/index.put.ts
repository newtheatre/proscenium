// Edits a duty. Its shifts already made keep their times.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { updateDuty } from '../../../../rota'
import { dutyInput } from '../../../../inputs'

export default defineRoute({
  ability: 'front-of-house.duty.manage',
  rateLimit: 'write',
  input: dutyInput,
}, (event, { input, unit }) => {
  updateDuty(unit.view(), getRouterParam(event, 'id')!, input)
  return { dutyId: getRouterParam(event, 'id') }
})
