// A bulk raise on a list priced by hand (BAR-04): with `preview` it only answers the old and new
// prices; without, it writes them as new prices from now or a later moment.
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { raisePrices } from '../../../../catalogue'

export default defineRoute({
  ability: 'bar.price.manage',
  rateLimit: 'write',
  input: z.object({
    categoryIds: z.array(z.string().min(1).max(64)).max(100).optional(), // not-policy: ids and a screen's categories
    percent: z.number().min(-90).max(500).optional(), // not-policy: bounds on a typing slip, not a rule
    amountMinor: z.number().int().optional(),
    effectiveFrom: z.number().int().optional(),
    preview: z.boolean(),
  }).strict(),
}, async (event, { input, actor, unit }) => {
  const { preview, ...rest } = input
  const rows = await raisePrices(preview ? null : unit, getRouterParam(event, 'id', { decode: true })!, rest, actor.accountId!)
  return { rows }
})
