// Archives an inspection kind, or brings it back. Recorded inspections stay.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { kindRow, setKindState } from '../../../../kinds'
import { stateInput } from '../../../../inputs'

export default defineRoute({ ability: 'inventory.setup.manage', rateLimit: 'write', idempotent: true, input: stateInput }, async (event, { input, unit }) => {
  setKindState(unit.view(), await kindRow(getRouterParam(event, 'id')!), input.to)
  return { state: input.to }
})
