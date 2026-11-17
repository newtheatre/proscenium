// Retires a promo code, or brings it back.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { setPromoActive } from '../../../../promo-codes'

export default defineRoute({
  ability: 'box-office.promo.manage',
  record: event => ['box-office.promo-code', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({ active: z.boolean() }).strict(),
}, async (_event, { input, unit, record }) => {
  setPromoActive(unit.view(), record!.id!, input.active)
  return { ok: true }
})
