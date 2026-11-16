// My data requests, with their state, dates and any hold codes (ID-16). The app turns each code
// into the plain sentence its module wrote for the person.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { privacyReady, requestsOf } from '../../../identity/data-requests'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default', input: z.object({}) }, async (_event, { actor }) => {
  return { available: await privacyReady(), requests: await requestsOf(actor.accountId!) }
})
