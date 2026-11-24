// One booking, for its booker or for whoever may see any booking here.
import { getRouterParam } from 'h3'
import { can, defineRoute } from '#kit'
import { bookingView } from '../../../../reading'

export default defineRoute({
  ability: 'spaces.booking.view',
  record: event => ['spaces.booking', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (event, { actor }) => {
  const id = getRouterParam(event, 'id')!
  const booking = await bookingView(id)
  const manage = (await can(actor, 'spaces.booking.manage', ['spaces.booking', id])).allowed
  return { booking, own: booking.bookedFor === actor.accountId, manage }
})
