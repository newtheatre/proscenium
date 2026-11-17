// One period, its totals, and what stops it being closed: the close checklist.
import { getRouterParam } from 'h3'
import { can, defineRoute, refuse } from '#kit'
import { getPeriod } from '../../../periods'
import { closeBlockers, periodTotals } from '../../../close'
import { balances } from '../../../ledger'

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
    // Where the period's money came from and went: each income and expense account that moved,
    // as a positive figure (income is credits less debits, an expense debits less credits).
    movement: (await balances({ periodId: period!.id }))
      .filter(b => b.kind === 'income' || b.kind === 'expense')
      .map(b => ({ accountId: b.accountId, code: b.code, name: b.name, kind: b.kind as 'income' | 'expense', currency: b.currency, amountMinor: b.kind === 'income' ? -b.balanceMinor : b.balanceMinor }))
      .filter(m => m.amountMinor !== 0),
    // What the viewer may do with it, so the screen offers only that.
    canClose: (await can(actor, 'finance.period.close', on)).allowed,
    canReopen: (await can(actor, 'finance.period.reopen', on)).allowed,
  }
})
