// Stock items with their levels at each location, and the locations (tab 2, "Stock"), with what their
// forms offer: the categories in use and the theatre's venues with their spaces.
import { defineRoute } from '#kit'
import { listVenues } from '#modules/core'
import { catalogue } from '../../../catalogue'
import { stock } from '../../../stock'

export default defineRoute({ ability: 'bar.stock.manage', rateLimit: 'default' }, async () => {
  const { categories } = await catalogue({ activeOnly: true })
  const venues = await listVenues()
  return {
    ...await stock(),
    categories: categories.map(c => ({ id: c.id, name: c.name })),
    venues: venues.map(v => ({ id: v.id, name: v.name, spaces: v.spaces.filter(s => !s.archived).map(s => ({ id: s.id, name: s.name })) })),
  }
})
