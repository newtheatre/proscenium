// Rooms and resources (SP-05, SP-10): core's active spaces by venue, each bookable or not, and
// every bookable with its state.
import { defineRoute } from '#kit'
import { listBookables, spacesByVenue } from '../../../setup'

export default defineRoute({ ability: 'spaces.bookable.manage', rateLimit: 'default' }, async () => {
  const [venues, bookables] = await Promise.all([spacesByVenue(), listBookables()])
  return { venues, bookables }
})
