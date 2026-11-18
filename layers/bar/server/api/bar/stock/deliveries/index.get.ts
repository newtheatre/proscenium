// Deliveries, drafts first then the latest received, with what the delivery form offers: the items and
// locations in use and the theatre's suppliers.
import { defineRoute } from '#kit'
import { listTerms } from '#modules/core'
import { stock } from '../../../../stock'
import { deliveries, SUPPLIERS } from '../../../../stock-moves'

export default defineRoute({ ability: 'bar.stock.receive', rateLimit: 'default' }, async () => {
  const { items, locations } = await stock()
  return {
    deliveries: await deliveries(),
    items: items.filter(i => i.active).map(i => ({ id: i.id, name: i.name, baseUnit: i.baseUnit, packSize: i.packSize, packName: i.packName, countUnitSize: i.countUnitSize, costMinor: i.costMinor })),
    locations: locations.filter(l => l.active).map(l => ({ id: l.id, name: l.name })),
    suppliers: (await listTerms(SUPPLIERS)).map(t => ({ id: t.id, label: t.label })),
  }
})
