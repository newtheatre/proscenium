// A performance's sales set-up, with the checklist that names anything missing before it can go on
// sale, the performance itself, and every band of its production.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { capacityOf, getPerformance, getProduction } from '#modules/core'
import { checklist, listBands, salesOf } from '../../../../../setup'

export default defineRoute({
  ability: 'box-office.performance.manage',
  record: event => ['core.performance', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (_event, { record }) => {
  const [sales, list, houseCapacity, performance] = await Promise.all([salesOf(record!.id), checklist(record!.id), capacityOf(record!.id), getPerformance(record!.id)])
  const production = await getProduction(performance.productionId)
  return {
    sales,
    houseCapacity,
    pools: list.pools,
    prices: list.prices,
    checklist: list.items,
    // For the set-up screen: what the performance is, and every band its production has.
    performance: { id: performance.id, productionId: production.id, title: production.title, label: performance.label, startsAt: performance.startsAt, state: performance.state },
    bands: await listBands(production.id),
  }
})
