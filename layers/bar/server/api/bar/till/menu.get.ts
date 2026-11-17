// What an outlet sells, at its prices, for the till's bar panel.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { menu } from '../../../catalogue'

export default defineRoute({
  ability: 'bar.sale.sell',
  rateLimit: 'default',
  input: z.object({ outlet: z.string().min(1).max(64) }), // not-policy: an id's length
}, async (_event, { input }) => await menu(input.outlet))
