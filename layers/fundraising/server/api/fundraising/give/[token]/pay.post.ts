// Starts the gift's payment with the online provider: its card form, or its own page and back.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { relyingParty } from '#modules/core'
import { payGift } from '../../../../giving'

export default defineRoute({ public: true, tokens: ['token'], rateLimit: 'write', idempotent: true, input: z.object({}).strict() }, async event =>
  payGift(getRouterParam(event, 'token')!, (await relyingParty(event)).origin))
