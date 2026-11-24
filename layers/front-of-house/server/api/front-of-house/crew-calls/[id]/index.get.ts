// One crew call for the console: its details, shifts and crew, with who has answered (FH-49).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { accountLabel } from '#modules/core'
import { crewCallView } from '../../../../crew-calls'

export default defineRoute({
  ability: 'front-of-house.crew-call.manage',
  record: event => ['front-of-house.crew-call', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, (_event, { record }) => crewCallView(record!.id!, accountLabel))
