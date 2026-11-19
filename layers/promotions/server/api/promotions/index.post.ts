// Makes a promotion, with its codes and what it applies to.
import { defineRoute } from '#kit'
import { createPromotion, promotionInput } from '../../promotions'

export default defineRoute({
  ability: 'promotions.promotion.manage',
  rateLimit: 'write',
  idempotent: true,
  input: promotionInput,
}, async (_event, { input, unit, actor }) => ({ id: await createPromotion(unit.view(), input, actor.accountId ?? null) }))
