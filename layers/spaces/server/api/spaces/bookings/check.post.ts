// What would happen to a booking, without making it (SP-16): confirmed at once, sent for a
// decision, or refused with the rule and the nearest free time. The form calls it as a person types.
import { defineRoute } from '#kit'
import { checkRequest } from '../../../rules'
import { checkInput } from '../../../inputs'
import { shapeVerdict } from '../../../shape'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default', input: checkInput }, async (_event, { actor, input }) =>
  await shapeVerdict(actor, input.bookableId, await checkRequest(actor, input)))
