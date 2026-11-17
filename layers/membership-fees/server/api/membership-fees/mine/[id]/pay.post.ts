// Starts the payment with the online provider. The answer says where the person goes next: the
// provider's page or its card form.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { relyingParty } from '#modules/core'
import { startPayment } from '../../../../paying'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', idempotent: true, input: z.object({}).strict() }, async (event, { actor }) =>
  startPayment(getRouterParam(event, 'id')!, actor.accountId!, (await relyingParty(event)).origin))
