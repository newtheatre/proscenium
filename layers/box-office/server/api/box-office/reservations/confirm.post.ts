// The link from "Confirm your reservation": the address is proved, so the basket becomes a
// reservation. The token is sealed by this site and names the basket and the account.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { relyingParty } from '#modules/core'
import { confirmReservation } from '../../../reservations'

export default defineRoute({
  public: true,
  rateLimit: 'write',
  input: z.object({ token: z.string().min(1).max(1000) }).strict(), // not-policy: shape bound
}, (event, { input, unit }) => confirmReservation(unit.view(), relyingParty(event).origin, input.token))
