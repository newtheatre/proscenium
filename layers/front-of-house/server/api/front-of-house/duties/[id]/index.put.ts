// Edits a duty. Its shifts already made keep their times.
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { updateDuty } from '../../../../rota'
import { dutyInput } from '../../../../inputs'

export default defineRoute({
  ability: 'front-of-house.duty.manage',
  rateLimit: 'write',
  input: dutyInput,
}, (event, { input, unit }) => {
  updateDuty(unit.view(), getRouterParam(event, 'id', { decode: true })!, input)
  return { dutyId: getRouterParam(event, 'id', { decode: true }) }
})
