// A crew call as a volunteer sees it: its dates, and whether they have answered its questions (CC1).
import { getRouterParam } from 'h3'
import { defineRoute, refuse } from '#kit'
import { CREW_SLOT, hasAnswered, requireCrewCall } from '../../../../crew-calls'
import { slotAsks } from '#modules/forms'

export default defineRoute({ ability: 'front-of-house.shift.sign-up', rateLimit: 'default' }, async (event, { actor }) => {
  const call = await requireCrewCall(getRouterParam(event, 'id'))
  if (call.state === 'draft' || call.state === 'archived') refuse('core.not-found', 'There is no such crew call.', { status: 404 }) // not-policy: HTTP status
  return {
    id: call.id,
    name: call.name,
    startsOn: call.startsOn,
    endsOn: call.endsOn,
    state: call.state,
    questions: await slotAsks(CREW_SLOT, call.id),
    answered: await hasAnswered(call.id, actor.accountId!),
  }
})
