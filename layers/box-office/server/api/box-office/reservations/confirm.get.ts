// What the link from "Confirm your reservation" is about to reserve, for its page to say before the
// button is pressed. The token comes in a header, so it stays out of addresses and logs.
import { getRequestHeader } from 'nuxt/server'
import { defineRoute } from '#kit'
import { reservationToConfirm } from '../../../reservations'

export default defineRoute({ public: true, rateLimit: 'default' }, async (event) => {
  return reservationToConfirm(getRequestHeader(event, 'x-confirm-token') ?? '')
})
