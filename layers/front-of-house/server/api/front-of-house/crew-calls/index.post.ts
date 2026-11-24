// Makes a crew call, as a draft (FH-49).
import { defineRoute } from '#kit'
import { createCrewCall } from '../../../crew-calls'
import { crewCallInput } from '../../../inputs'

export default defineRoute({
  ability: 'front-of-house.crew-call.manage',
  rateLimit: 'write',
  idempotent: true,
  input: crewCallInput,
}, (_event, { input, actor, unit }) => ({ crewCallId: createCrewCall(unit.view(), input, actor.accountId!) }))
