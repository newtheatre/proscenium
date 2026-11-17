// Pay (P3): opens the payment for the holder's charge, or reuses the open one.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { openPayment } from '../../../../paying'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', input: z.object({}).strict() }, (event, { actor, unit }) =>
  openPayment(unit.view(), getRouterParam(event, 'id')!, actor.accountId!))
