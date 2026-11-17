// The link from "Confirm your reservation": the address is proved, so the basket becomes a
// reservation for the account it was sent to. The link holds a random token and works once.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { fromRequest } from '../../../links'
import { confirmReservation } from '../../../reservations'

export default defineRoute({
  public: true,
  rateLimit: 'write',
  input: z.object({ token: z.string().min(1).max(200) }).strict(), // not-policy: shape bound
}, async (event, { input, unit }) => {
  await fromRequest(event)
  return confirmReservation(unit.view(), input.token)
})
