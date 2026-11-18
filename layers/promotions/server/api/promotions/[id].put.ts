// Changes a promotion. What was already sold with it keeps its price.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { promotionInput, updatePromotion } from '../../promotions'

export default defineRoute({
  ability: 'promotions.promotion.manage',
  record: event => ['promotions.promotion', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: promotionInput,
}, async (_event, { input, unit, record }) => {
  await updatePromotion(unit.view(), record!.id!, input)
  return { ok: true }
})
