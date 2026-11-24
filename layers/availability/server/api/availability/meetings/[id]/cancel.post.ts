// M4: the organiser cancels, with an optional reason.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { cancelInput } from '../../../../inputs'
import { cancel } from '../../../../meetings'

export default defineRoute({ ability: 'availability.meeting.arrange', rateLimit: 'write', idempotent: true, input: cancelInput }, async (event, { actor, input, unit }) => {
  await cancel(unit.view(), getRouterParam(event, 'id')!, actor, input.reason)
  return { cancelled: true }
})
