// The organiser stops asking one person (rule R6). Their availability is untouched.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { withdrawInput } from '../../../../inputs'
import { withdraw } from '../../../../requests'

export default defineRoute({ ability: 'availability.request.send', rateLimit: 'write', idempotent: true, input: withdrawInput }, async (event, { actor, input, unit }) => {
  await withdraw(unit.view(), getRouterParam(event, 'id')!, input.accountId, actor)
  return { withdrawn: true }
})
