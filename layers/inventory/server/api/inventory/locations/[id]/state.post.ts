// Archives a location, or brings it back. One holding items or other places stays (I8).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { locationRow, setLocationState } from '../../../../locations'
import { stateInput } from '../../../../inputs'

export default defineRoute({ ability: 'inventory.setup.manage', rateLimit: 'write', idempotent: true, input: stateInput }, async (event, { input, unit }) => {
  setLocationState(unit.view(), await locationRow(getRouterParam(event, 'id')!), input.to)
  return { state: input.to }
})
