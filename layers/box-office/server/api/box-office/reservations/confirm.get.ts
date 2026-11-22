// What the link from "Confirm your reservation" is about to reserve, for its page to say before the
// button is pressed. The token comes in a header, so it stays out of addresses and logs.
import { getHeader } from 'h3'
import { defineRoute } from '#kit'
import { reservationToConfirm } from '../../../reservations'

export default defineRoute({ public: true, rateLimit: 'default' }, async (event) => {
  return reservationToConfirm(getHeader(event, 'x-confirm-token') ?? '')
})
