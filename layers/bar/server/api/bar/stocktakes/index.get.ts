// Stocktakes (S10): live counts first, then the latest finished, with what starting one offers, and
// how many items in use have no category (they are counted only with everything).
import { can, defineRoute } from '#kit'
import { catalogue } from '../../../catalogue'
import { stock } from '../../../stock'
import { stocktakes } from '../../../stocktakes'

export default defineRoute({ ability: 'bar.stock.count', rateLimit: 'default' }, async (_event, { actor }) => {
  const { items, locations } = await stock()
  const { categories } = await catalogue({ activeOnly: true })
  return {
    stocktakes: await stocktakes(),
    locations: locations.filter(l => l.active).map(l => ({ id: l.id, name: l.name })),
    categories: categories.map(c => ({ id: c.id, name: c.name })),
    uncategorised: items.filter(i => i.active && !i.categoryId).length,
    can: { approve: (await can(actor, 'bar.stocktake.approve')).allowed },
  }
})
