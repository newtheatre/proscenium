// Changes a promo code. Tickets already sold with it keep their price.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { promoInput, updatePromoCode } from '../../../promo-codes'

export default defineRoute({
  ability: 'box-office.promo.manage',
  record: event => ['box-office.promo-code', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: promoInput,
}, async (_event, { input, unit, record }) => {
  await updatePromoCode(unit.view(), record!.id!, input)
  return { ok: true }
})
