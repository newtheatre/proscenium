// PM-S2: start, carry on or start again (rules S1 to S4, S8). Makes the store from the real database,
// so it runs outside practice whether or not the page sent the mark.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { start } from '../../../practice/service'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'default',
  practice: 'outside',
  input: z.object({ scenario: z.string().max(80), again: z.boolean().optional(), replace: z.boolean().optional() }).strict(), // not-policy: a scenario id's length
}, async (_event, { actor, input }) => start(actor, input.scenario, { again: input.again, replace: input.replace }))
