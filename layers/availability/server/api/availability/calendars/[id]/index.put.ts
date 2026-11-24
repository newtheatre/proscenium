// S14: a connection's label and what its tentative events become.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { connectionInput } from '../../../../inputs'
import { changeConnection } from '../../../../calendars'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', idempotent: true, input: connectionInput }, async (event, { actor, input, unit }) => {
  await changeConnection(unit.view(), getRouterParam(event, 'id')!, actor.accountId!, input)
  return { changed: true }
})
