// M1: the organiser arranges a meeting for a decided poll's people or for groups they plan for.
import { defineRoute, refuse } from '#kit'
import { arrangeInput } from '../../../inputs'
import { arrange } from '../../../meetings'
import { plannable } from '../../../planning'

export default defineRoute({ ability: 'availability.meeting.arrange', rateLimit: 'write', idempotent: true, input: arrangeInput }, async (_event, { actor, input, unit }) => {
  for (const groupId of input.groupIds) await plannable(actor, { groupId })
  if (input.accountIds.length && (await plannable(actor, { accountIds: input.accountIds })).hidden)
    refuse('availability.request.not-yours', 'You can ask only people you plan for.', { status: 403 })
  return await arrange(unit.view(), actor, input)
})
