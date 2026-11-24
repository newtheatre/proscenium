// A planner asks people to check their availability (AV-08, rule R1): groups they plan for, and
// people in such groups. Somebody they may not plan for refuses the whole request.
import { defineRoute, refuse } from '#kit'
import { requestInput } from '../../../inputs'
import { plannable } from '../../../planning'
import { openRequest } from '../../../requests'

export default defineRoute({ ability: 'availability.request.send', rateLimit: 'write', idempotent: true, input: requestInput }, async (_event, { actor, input, unit }) => {
  for (const groupId of input.groupIds) await plannable(actor, { groupId })
  if (input.accountIds.length && (await plannable(actor, { accountIds: input.accountIds })).hidden)
    refuse('availability.request.not-yours', 'You can ask only people you plan for.', { status: 403 })
  return await openRequest(unit.view(), { ...input, sourceRef: null, openedBy: actor.accountId! })
})
