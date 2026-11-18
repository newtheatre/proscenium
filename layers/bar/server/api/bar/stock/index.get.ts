// Stock items with their levels at each location, and the locations (tab 2, "Stock"), with what their
// forms offer: the categories in use, the theatre's venues with their spaces, and the reasons stock is
// written off. Each item's allergens come too when the viewer may record them.
import { can, defineRoute } from '#kit'
import { listTerms, listVenues } from '#modules/core'
import { allergenAnswers } from '../../../allergens'
import { catalogue } from '../../../catalogue'
import { stock } from '../../../stock'
import { WASTAGE_REASONS } from '../../../stock-moves'

export default defineRoute({ ability: 'bar.stock.manage', rateLimit: 'default' }, async (_event, { actor }) => {
  const { categories } = await catalogue({ activeOnly: true })
  const venues = await listVenues()
  const canAllergens = (await can(actor, 'bar.allergens.manage')).allowed
  const { stockItems } = canAllergens ? await allergenAnswers() : { stockItems: new Map() }
  return {
    canAllergens,
    allergens: Object.fromEntries(stockItems),
    ...await stock(),
    categories: categories.map(c => ({ id: c.id, name: c.name })),
    wastageReasons: (await listTerms(WASTAGE_REASONS)).map(t => ({ id: t.id, label: t.label })),
    venues: venues.map(v => ({ id: v.id, name: v.name, spaces: v.spaces.filter(s => !s.archived).map(s => ({ id: s.id, name: s.name })) })),
  }
})
