// One period, its totals, and what stops it being closed: the close checklist.
import { getRouterParam } from 'h3'
import { can, defineRoute, refuse } from '#kit'
import { getPeriod } from '../../../periods'
import { closeBlockers, periodTotals } from '../../../close'

export default defineRoute({
  ability: 'finance.ledger.view',
  record: event => ['finance.period', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (_event, { record, actor }) => {
  const period = await getPeriod(record!.id)
  if (!period) refuse('core.not-found', 'There is no such period.', { status: 404 })
  const on = { type: 'finance.period', id: period!.id }
  return {
    period: { ...period!, ...(await periodTotals(period!.id)) },
    blockers: await closeBlockers(period!),
    // What the viewer may do with it, so the screen offers only that.
    canClose: (await can(actor, 'finance.period.close', on)).allowed,
    canReopen: (await can(actor, 'finance.period.reopen', on)).allowed,
  }
})
