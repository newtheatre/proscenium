// Stock on hand for the console (S7): each item in use with its level at every location, the
// locations in use, the reasons stock is written off, and what the viewer may do from the list.
import { can, defineRoute } from '#kit'
import { listTerms } from '#modules/core'
import { stock } from '../../../stock'
import { WASTAGE_REASONS } from '../../../stock-moves'

export default defineRoute({ ability: 'bar.stock.view', rateLimit: 'default' }, async (_event, { actor }) => {
  const { items, locations } = await stock()
  return {
    items: items.filter(i => i.active),
    locations: locations.filter(l => l.active).map(l => ({ id: l.id, name: l.name })),
    wastageReasons: (await listTerms(WASTAGE_REASONS)).map(t => ({ id: t.id, label: t.label })),
    can: { receive: (await can(actor, 'bar.stock.receive')).allowed, waste: (await can(actor, 'bar.stock.waste')).allowed },
  }
})
