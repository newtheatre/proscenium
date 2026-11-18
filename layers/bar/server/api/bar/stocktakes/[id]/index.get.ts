// One count: its lines, with the level while counting (unless counts are blind) and what was
// expected once submitted, and what the viewer may do with it.
import { getRouterParam } from 'h3'
import { can, defineRoute } from '#kit'
import { stocktake } from '../../../../stocktakes'

export default defineRoute({
  ability: 'bar.stock.count',
  record: event => ['bar.stocktake', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (_event, { actor, record }) => {
  const approver = (await can(actor, 'bar.stocktake.approve')).allowed
  return { ...await stocktake(record!.id, { approver }), can: { approve: approver } }
})
