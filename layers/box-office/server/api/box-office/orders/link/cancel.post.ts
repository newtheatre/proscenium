// Cancel or reduce a booking from the link in its messages (R-2), with no sign-in, or as its
// signed-in owner by its id. A reservation's seats go back on sale at once. A paid booking can be cancelled here only when the theatre lets
// buyers do it and the cut-off has not passed; the price less the fee then goes back the way it was
// paid. With no lines named, the whole booking goes.
import { z } from 'zod'
import { defineRoute, idSchema } from '#kit'
import { orderKeyOf } from '../../../../order-key'
import { cancelFromLink } from '../../../../reservations'

export default defineRoute({
  public: true,
  rateLimit: 'write',
  idempotent: true,
  input: z.object({ lineIds: z.array(idSchema('orl')).min(1).max(50).optional() }).strict(), // not-policy: shape bounds
}, (event, { actor, input, unit }) => cancelFromLink(unit.view(), orderKeyOf(event, actor), input.lineIds))
