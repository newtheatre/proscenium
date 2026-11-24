// M2: an invitee says going or not going.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { respondInput } from '../../../../inputs'
import { respond } from '../../../../meetings'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', idempotent: true, input: respondInput }, async (event, { actor, input, unit }) => {
  await respond(unit.view(), getRouterParam(event, 'id')!, actor, input.response)
  return { response: input.response }
})
