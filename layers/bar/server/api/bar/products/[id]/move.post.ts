// Moves a product in its category (BAR-03): one place up or down, or to the place it was dragged to.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { moveProduct } from '../../../../catalogue'

export default defineRoute({
  ability: 'bar.product.manage',
  record: event => ['bar.product', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.union([z.object({ direction: z.enum(['up', 'down']) }).strict(), z.object({ to: z.number().int().min(0) }).strict()]),
}, async (_event, { input, record, unit }) => {
  await moveProduct(unit, record!.id, input)
  return { ok: true }
})
