// The passes on sale at the till (BO-64), with their prices and whether each covers the performance
// the till is selling, so a pass sold there can give its first entry tonight.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { deskPassesOnSale } from '../../../pass-sales'

export default defineRoute({
  ability: 'box-office.order.view',
  rateLimit: 'default',
  input: z.object({ performanceId: z.string().min(1).max(64) }).strict(), // not-policy: an id
}, async (_event, { input }) => ({ passes: await deskPassesOnSale(input.performanceId) }))
