// Makes a promo code (BO-17).
import { defineRoute } from '#kit'
import { createPromoCode, promoInput } from '../../../promo-codes'

export default defineRoute({
  ability: 'box-office.promo.manage',
  rateLimit: 'write',
  idempotent: true,
  input: promoInput,
}, async (_event, { input, unit, actor }) => ({ id: await createPromoCode(unit.view(), input, actor.accountId ?? null) }))
