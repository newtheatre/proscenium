// Retires a promotion, or brings it back.
import { z } from 'zod'
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { setPromotionActive } from '../../../promotions'

export default defineRoute({
  ability: 'promotions.promotion.manage',
  record: event => ['promotions.promotion', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({ active: z.boolean() }).strict(),
}, async (_event, { input, unit, record }) => {
  setPromotionActive(unit.view(), record!.id!, input.active)
  return { ok: true }
})
