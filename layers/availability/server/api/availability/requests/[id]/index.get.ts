// One request (S5, S11): its period and message for someone it asks, and who has answered for its organiser.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { requestView } from '../../../../requests'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (event, { actor }) =>
  await requestView(getRouterParam(event, 'id')!, actor))
