// My bookings (part 5): upcoming, requests waiting for a decision, and the past.
import { defineRoute, nowMs } from '#kit'
import { myBookings } from '../../../reading'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (_event, { actor }) => await myBookings(actor.accountId!, nowMs()))
