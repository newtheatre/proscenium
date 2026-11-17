// "Can be used as a mixer": gives the product its hidden mixer measure, or retires it.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { setMixer } from '../../../../choices'

export default defineRoute({
  ability: 'bar.product.manage',
  record: event => ['bar.product', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({ on: z.boolean() }).strict(),
}, async (_event, { input, record, unit }) => {
  await setMixer(unit, record!.id, input.on)
  return { ok: true }
})
