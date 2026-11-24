// The title, notes and attendee count of a booking (rule X1), by its booker or staff.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { actingOn, editDetails } from '../../../../changes'
import { detailsInput } from '../../../../inputs'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', idempotent: true, input: detailsInput }, async (event, { actor, input, unit }) => {
  const acting = await actingOn(actor, getRouterParam(event, 'id')!)
  editDetails(unit.view(), acting, actor.accountId!, input)
  return { bookingId: acting.booking.id }
})
