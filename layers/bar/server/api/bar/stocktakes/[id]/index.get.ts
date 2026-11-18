// One count: its lines, with the level while counting (unless counts are blind) and what was
// expected once submitted, and what the viewer may do with it: whether they may approve it, or are
// barred because they submitted it and its difference is large, and the value above which a
// difference needs a reason.
import { getRouterParam } from 'h3'
import { can, defineRoute } from '#kit'
import { approval, stocktake } from '../../../../stocktakes'

export default defineRoute({
  ability: 'bar.stock.count',
  record: event => ['bar.stocktake', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (_event, { actor, record }) => {
  const approver = (await can(actor, 'bar.stocktake.approve')).allowed
  const { ownCount, selfApproveUnderMinor, reasonOverMinor } = await approval(record!.id, actor.accountId ?? null)
  return { ...await stocktake(record!.id, { approver }), can: { approve: approver, ownCount }, selfApproveUnderMinor, reasonOverMinor }
})
