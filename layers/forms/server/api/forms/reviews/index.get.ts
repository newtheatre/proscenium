// The reviews a person is asked for now (FB-405): their own assignments, and nothing they have a
// conflict of interest on.
import { defineRoute } from '#kit'
import { waitingFor } from '../../../review'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (_event, { actor }) => {
  return { reviews: await waitingFor(actor.accountId!) }
})
