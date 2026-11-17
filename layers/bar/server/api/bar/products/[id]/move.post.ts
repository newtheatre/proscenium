// Moves a product one place up or down in its category: the keyboard's way to reorder (BAR-03).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { moveProduct } from '../../../../catalogue'

export default defineRoute({
  ability: 'bar.product.manage',
  record: event => ['bar.product', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({ direction: z.enum(['up', 'down']) }).strict(),
}, async (_event, { input, record, unit }) => {
  await moveProduct(unit, record!.id, input.direction)
  return { ok: true }
})
