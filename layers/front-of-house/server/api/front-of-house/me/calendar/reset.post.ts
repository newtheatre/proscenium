// Makes the person a new calendar feed address; the old one stops working (SU-8).
import { z } from 'zod'
import { defineRoute } from '#kit'
import { resetFeed } from '../../../../calendar'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', idempotent: true, input: z.object({}).strict() }, async (_event, { actor, unit }) => ({ url: await resetFeed(unit.view(), actor.accountId!) }))
