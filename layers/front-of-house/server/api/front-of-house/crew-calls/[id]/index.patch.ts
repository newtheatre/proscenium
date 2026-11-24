// Changes a crew call's details or perks rules (FH-49).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { updateCrewCall } from '../../../../crew-calls'
import { crewCallInput } from '../../../../inputs'

export default defineRoute({
  ability: 'front-of-house.crew-call.manage',
  record: event => ['front-of-house.crew-call', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: crewCallInput.partial(),
}, async (_event, { input, record, unit }) => {
  await updateCrewCall(unit.view(), record!.id!, input)
  return { ok: true }
})
