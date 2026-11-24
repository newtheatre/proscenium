// Who has answered (part 4, requestStatus): counts for anyone asked, each person's state for the organiser.
import { getRouterParam } from 'h3'
import { defineRoute, refuse } from '#kit'
import { requestStatus } from '../../../../requests'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (event, { actor }) =>
  await requestStatus(getRouterParam(event, 'id')!, actor) ?? refuse('availability.request.not-found', 'There is no such request.', { status: 404 }))
