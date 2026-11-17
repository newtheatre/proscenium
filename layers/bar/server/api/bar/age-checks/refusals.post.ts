// Records a refusal at an outlet (BAR-18): from the age prompt, from "Refuse sale", or for a customer
// turned away before anything was rung up. Anyone who may sell there may record one.
import { defineRoute, requireAbility } from '#kit'
import { recordRefusal, refusalInput } from '../../../age-checks'

export default defineRoute({ ability: 'bar.sale.sell', rateLimit: 'write', input: refusalInput }, async (_event, { actor, unit, input }) => {
  await requireAbility(actor, 'bar.sale.sell', ['bar.outlet', input.outletId])
  return { id: await recordRefusal(unit, input, actor.accountId ?? null) }
})
