// Records what a choice option brings, such as oat milk or an Irish cream shot, from its label.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { allergenInput, recordAllergens } from '../../../../allergens'

export default defineRoute({ ability: 'bar.allergens.manage', rateLimit: 'write', input: allergenInput }, async (event, { input, actor, unit }) => {
  await recordAllergens(unit, { optionId: getRouterParam(event, 'id') ?? '' }, input, actor.accountId!)
  return { ok: true }
})
