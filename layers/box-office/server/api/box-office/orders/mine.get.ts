// My tickets (C3): the signed-in person's own bookings, upcoming and past, with each paid ticket's
// door code signed afresh so it can be shown at the door.
import { defineRoute } from '#kit'
import { myBookings } from '../../../mine'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, (_event, { actor }) => myBookings(actor.accountId!))
