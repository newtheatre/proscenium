// My notification choices (FH-6): the optional kinds of message on the sides the person has, each
// on or off. Messages about their own bookings, shifts and account are not listed: they always come.
import { defineRoute } from '#kit'
import { isMember } from '../../../interface/viewer'
import { topicsFor } from '../../../notifications/preferences'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (_event, { actor }) => {
  return { topics: await topicsFor(actor.accountId!, await isMember(actor)) }
})
