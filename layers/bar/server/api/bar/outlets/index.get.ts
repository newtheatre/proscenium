// The outlets (S13), with what their form offers: the price lists in use, the theatre's spaces,
// the stock locations in use, and the sizes on sale that can be pinned as favourites.
import { all, defineRoute } from '#kit'
import { listSpaces, placeName } from '#modules/core'
import { catalogue, outlets, priceLists } from '../../../catalogue'

export default defineRoute({ ability: 'bar.outlet.manage', rateLimit: 'default' }, async () => {
  const spaces = await listSpaces({ archived: false })
  const { categories } = await catalogue({ activeOnly: true })
  return {
    outlets: await outlets(),
    lists: (await priceLists()).filter(l => l.active).map(l => ({ id: l.id, name: l.name })),
    spaces: await Promise.all(spaces.map(async s => ({ id: s.id, name: await placeName(s.id) ?? s.name }))),
    locations: await all<{ id: string, name: string }>('SELECT id, name FROM bar_stock_locations WHERE active = 1 ORDER BY lower(name), id'),
    sizes: categories.flatMap(c => c.products.flatMap(p => p.variants.filter(v => !v.mixerMeasure).map(v => ({ id: v.id, product: p.name, size: v.name, category: c.name })))),
  }
})
