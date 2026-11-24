// A planner marks a member of a group they plan for busy or maybe (rule A8). The person is told.
import { defineRoute } from '#kit'
import { onBehalfInput } from '../../../inputs'
import { createOnBehalf } from '../../../on-behalf'

export default defineRoute({ ability: 'availability.entry.on-behalf', rateLimit: 'write', idempotent: true, input: onBehalfInput }, async (_event, { actor, input, unit }) => {
  const { accountId, ...entry } = input
  return { exceptionId: await createOnBehalf(unit.view(), actor, accountId, entry) }
})
