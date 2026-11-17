// The outlets (S13), with what their form offers: the price lists in use, the theatre's spaces, and
// the sizes on sale that can be pinned as favourites.
import { defineRoute } from '#kit'
import { listSpaces, placeName } from '#modules/core'
import { catalogue, outlets, priceLists } from '../../../catalogue'

export default defineRoute({ ability: 'bar.outlet.manage', rateLimit: 'default' }, async () => {
  const spaces = await listSpaces({ archived: false })
  const { categories } = await catalogue({ activeOnly: true })
  return {
    outlets: await outlets(),
    lists: (await priceLists()).filter(l => l.active).map(l => ({ id: l.id, name: l.name })),
    spaces: await Promise.all(spaces.map(async s => ({ id: s.id, name: await placeName(s.id) ?? s.name }))),
    sizes: categories.flatMap(c => c.products.flatMap(p => p.variants.filter(v => !v.mixerMeasure).map(v => ({ id: v.id, product: p.name, size: v.name, category: c.name })))),
  }
})
