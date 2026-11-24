// Makes a booking or a request under every rule (SP-15, SP-17, SP-23, SP-24). A refusal names its
// rule; a clash at the moment of saving leaves the form as it was.
import { defineRoute } from '#kit'
import { requestBooking } from '../../../rules'
import { requestInput } from '../../../inputs'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', idempotent: true, input: requestInput }, async (_event, { actor, input, unit }) => {
  const { bookingId, state } = await requestBooking(unit.view(), actor, input)
  return { bookingId, state }
})
