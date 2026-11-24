// F7: the organiser sends 2 to 6 times from Find a time to the people of groups they plan for.
import { defineRoute, refuse } from '#kit'
import { pollInput } from '../../../inputs'
import { plannable } from '../../../planning'
import { sendPoll } from '../../../polls'

export default defineRoute({ ability: 'availability.find.use', rateLimit: 'write', idempotent: true, input: pollInput }, async (_event, { actor, input, unit }) => {
  for (const groupId of input.groupIds) await plannable(actor, { groupId })
  if (input.accountIds.length && (await plannable(actor, { accountIds: input.accountIds })).hidden)
    refuse('availability.request.not-yours', 'You can ask only people you plan for.', { status: 403 })
  return await sendPoll(unit.view(), actor, input)
})
