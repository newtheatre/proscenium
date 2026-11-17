// Cancel or reduce a reservation from the email (R-2): the seats go back on sale at once, with no
// sign-in and no refund step. With no lines named, the whole reservation goes.
import { z } from 'zod'
import { getHeader } from 'h3'
import { defineRoute, idSchema } from '#kit'
import { cancelFromLink } from '../../../../reservations'

export default defineRoute({
  public: true,
  rateLimit: 'write',
  input: z.object({ lineIds: z.array(idSchema('orl')).min(1).max(50).optional() }).strict(), // not-policy: shape bounds
}, (event, { input, unit }) => cancelFromLink(unit.view(), getHeader(event, 'x-order-token') ?? '', input.lineIds))
