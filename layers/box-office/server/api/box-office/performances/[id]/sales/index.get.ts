// A performance's sales set-up, with the checklist that names anything missing before it can go on sale.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { capacityOf } from '#modules/core'
import { checklist, salesOf } from '../../../../../setup'

export default defineRoute({
  ability: 'box-office.performance.manage',
  record: event => ['core.performance', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (_event, { record }) => {
  const [sales, list, houseCapacity] = await Promise.all([salesOf(record!.id), checklist(record!.id), capacityOf(record!.id)])
  return { sales, houseCapacity, pools: list.pools, prices: list.prices, checklist: list.items }
})
