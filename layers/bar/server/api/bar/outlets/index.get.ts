// The outlets (S13), with what their form offers: the price lists in use and the theatre's spaces.
import { defineRoute } from '#kit'
import { listSpaces, placeName } from '#modules/core'
import { outlets, priceLists } from '../../../catalogue'

export default defineRoute({ ability: 'bar.outlet.manage', rateLimit: 'default' }, async () => {
  const spaces = await listSpaces({ archived: false })
  return {
    outlets: await outlets(),
    lists: (await priceLists()).filter(l => l.active).map(l => ({ id: l.id, name: l.name })),
    spaces: await Promise.all(spaces.map(async s => ({ id: s.id, name: await placeName(s.id) ?? s.name }))),
  }
})
