// I1: the person connects a calendar address of their own; it saves only after it reads as a calendar.
import { defineRoute } from '#kit'
import { connectInput } from '../../../inputs'
import { connectIcs } from '../../../calendars'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', idempotent: true, input: connectInput }, async (_event, { actor, input, unit }) => ({
  connectionId: await connectIcs(unit.view(), actor.accountId!, input),
}))
