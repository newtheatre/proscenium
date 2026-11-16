// One period, its totals, and what stops it being closed: the close checklist.
import { getRouterParam } from 'h3'
import { defineRoute, refuse } from '#kit'
import { getPeriod } from '../../../periods'
import { closeBlockers, periodTotals } from '../../../close'

export default defineRoute({
  ability: 'finance.ledger.view',
  record: event => ['finance.period', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (_event, { record }) => {
  const period = await getPeriod(record!.id)
  if (!period) refuse('core.not-found', 'There is no such period.', { status: 404 })
  return { period: { ...period!, ...(await periodTotals(period!.id)) }, blockers: await closeBlockers(period!) }
})
