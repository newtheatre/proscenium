// The person's private calendar feed address, made the first time it is asked for (SU-8).
import { z } from 'zod'
import { defineRoute } from '#kit'
import { feedAddress } from '../../../../calendar'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', idempotent: true, input: z.object({}).strict() }, async (_event, { actor, unit }) => ({ url: await feedAddress(unit.view(), actor.accountId!) }))
