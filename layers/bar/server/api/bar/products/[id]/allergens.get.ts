// A product's allergens as last recorded, and every check of its label, newest first. A size made from
// stock comes with the answer worked out from its recipe's items, and the items, so the page can say
// where to record them.
import { getRouterParam } from 'h3'
import { all, defineRoute } from '#kit'
import { allergenAnswers, allergenHistory, answerFor, sizeAnswer, stockLinks } from '../../../../allergens'

export default defineRoute({
  ability: 'bar.allergens.manage',
  record: event => ['bar.product', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (_event, { record }) => {
  const answers = await allergenAnswers()
  const links = await stockLinks()
  const variants = await all<{ id: string, name: string }>('SELECT id, name FROM bar_variants WHERE product_id = ? ORDER BY position, id', record!.id)
  const names = new Map((await all<{ id: string, name: string }>('SELECT id, name FROM bar_stock_items')).map(i => [i.id, i.name] as const))
  return {
    answer: await answerFor({ productId: record!.id }),
    history: await allergenHistory({ productId: record!.id }),
    sizes: variants.filter(v => links.recipes.get(v.id)?.length).map(v => ({
      variantId: v.id,
      name: v.name,
      answer: sizeAnswer(answers, links, v.id, record!.id)!,
      items: links.recipes.get(v.id)!.map(i => ({ id: i, name: names.get(i) ?? '', checked: !!answers.stockItems.get(i)?.checked })),
    })),
  }
})
