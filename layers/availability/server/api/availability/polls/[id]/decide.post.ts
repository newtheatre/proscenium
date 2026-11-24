// F8: the organiser settles on one of the poll's times.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { decideInput } from '../../../../inputs'
import { decide } from '../../../../polls'

export default defineRoute({ ability: 'availability.find.use', rateLimit: 'write', idempotent: true, input: decideInput }, async (event, { actor, input, unit }) => {
  await decide(unit.view(), getRouterParam(event, 'id')!, input.slotId, actor)
  return { decided: true }
})
