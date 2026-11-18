// Every choice with its options, for the Choices set-up screen, with each hand-listed option's
// allergens when the viewer may record them (its stock item's, when it has one), and its stock item
// when the viewer sets up stock, and the drinks that can be mixers (a new Mixer choice's usual pick).
import { all, can, defineRoute } from '#kit'
import { allergenAnswers, optionAnswer, stockLinks } from '../../../allergens'
import { choiceGroups } from '../../../choices'

export default defineRoute({ ability: 'bar.product.manage', rateLimit: 'default' }, async (_event, { actor }) => {
  const groups = await choiceGroups()
  const canAllergens = (await can(actor, 'bar.allergens.manage')).allowed
  const answers = canAllergens ? await allergenAnswers() : null
  const links = canAllergens ? await stockLinks() : null
  const canStock = (await can(actor, 'bar.stock.manage')).allowed
  return {
    groups,
    mixers: await all<{ key: string, label: string }>(
      `SELECT v.id AS key, p.name AS label FROM bar_variants v JOIN bar_products p ON p.id = v.product_id JOIN bar_categories c ON c.id = p.category_id
        WHERE v.mixer_measure = 1 AND v.active = 1 AND p.active = 1 AND c.active = 1 ORDER BY c.position, p.position, lower(p.name), v.id`),
    canStock,
    stockItems: canStock ? await all<{ id: string, name: string }>('SELECT id, name FROM bar_stock_items WHERE active = 1 ORDER BY lower(name), id') : [],
    stockOf: canStock ? Object.fromEntries((await all<{ id: string, stock_item_id: string }>('SELECT id, stock_item_id FROM bar_choice_options WHERE stock_item_id IS NOT NULL')).map(r => [r.id, r.stock_item_id])) : {},
    canAllergens,
    allergens: answers && links
      ? Object.fromEntries(groups.flatMap(g => g.options.flatMap((o) => {
          const answer = o.optionId ? optionAnswer(answers, links, o.optionId) : undefined
          return answer ? [[o.optionId!, answer]] : []
        })))
      : {},
    // Options whose allergens are their stock item's: recorded on the item, not here.
    allergensFromStock: links ? [...links.optionStock.keys()] : [],
  }
})
