// Every choice with its options, for the Choices set-up screen, with each hand-listed option's
// allergens when the viewer may record them, and its stock item when the viewer sets up stock.
import { all, can, defineRoute } from '#kit'
import { allergenAnswers } from '../../../allergens'
import { choiceGroups } from '../../../choices'

export default defineRoute({ ability: 'bar.product.manage', rateLimit: 'default' }, async (_event, { actor }) => {
  const groups = await choiceGroups()
  const canAllergens = (await can(actor, 'bar.allergens.manage')).allowed
  const { options } = canAllergens ? await allergenAnswers() : { options: new Map() }
  const canStock = (await can(actor, 'bar.stock.manage')).allowed
  return {
    groups,
    canStock,
    stockItems: canStock ? await all<{ id: string, name: string }>('SELECT id, name FROM bar_stock_items WHERE active = 1 ORDER BY lower(name), id') : [],
    stockOf: canStock ? Object.fromEntries((await all<{ id: string, stock_item_id: string }>('SELECT id, stock_item_id FROM bar_choice_options WHERE stock_item_id IS NOT NULL')).map(r => [r.id, r.stock_item_id])) : {},
    canAllergens,
    allergens: canAllergens ? Object.fromEntries(groups.flatMap(g => g.options.flatMap(o => o.optionId && options.has(o.optionId) ? [[o.optionId, options.get(o.optionId)!]] : []))) : {},
  }
})
