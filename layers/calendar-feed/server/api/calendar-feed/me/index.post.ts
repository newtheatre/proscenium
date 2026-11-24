// The person's private calendar feed address, made the first time it is asked for (C-70, CF1).
import { z } from 'zod'
import { defineRoute } from '#kit'
import { feedAddress } from '../../../feed'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', idempotent: true, input: z.object({}).strict() }, async (_event, { actor, unit }) => ({ url: await feedAddress(unit, actor.accountId!) }))
