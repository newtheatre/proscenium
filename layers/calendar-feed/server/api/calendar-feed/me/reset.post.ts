// Makes the person a new calendar feed address; the old one stops working at once (C-70, CF1).
import { z } from 'zod'
import { defineRoute } from '#kit'
import { resetFeed } from '../../../feed'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', idempotent: true, input: z.object({}).strict() }, async (_event, { actor, unit }) => ({ url: await resetFeed(unit, actor.accountId!) }))
