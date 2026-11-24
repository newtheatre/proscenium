// Records a product's allergens from its label, replacing what was listed, and logs the check.
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { allergenInput, recordAllergens } from '../../../../allergens'

export default defineRoute({
  ability: 'bar.allergens.manage',
  record: event => ['bar.product', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: allergenInput,
}, async (_event, { input, record, actor, unit }) => {
  await recordAllergens(unit, { productId: record!.id }, input, actor.accountId!)
  return { ok: true }
})
