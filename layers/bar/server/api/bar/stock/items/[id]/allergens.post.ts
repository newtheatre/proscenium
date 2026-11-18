// Records a stock item's allergens from its label, replacing what was listed, and logs the check. Every
// product whose recipe names the item works its answer out from it.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { allergenInput, recordAllergens } from '../../../../../allergens'

export default defineRoute({
  ability: 'bar.allergens.manage',
  record: event => ['bar.stock-item', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: allergenInput,
}, async (_event, { input, actor, record, unit }) => {
  await recordAllergens(unit, { stockItemId: record!.id }, input, actor.accountId!)
  return { ok: true }
})
