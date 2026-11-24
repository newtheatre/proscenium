// One period, its totals, and what stops it being closed: the close checklist.
import { getRouterParam } from 'nuxt/server'
import { can, defineRoute, refuse, today } from '#kit'
import { previousDate } from '#kit/clock'
import { getPeriod } from '../../../periods'
import { closeBlockers, periodTotals } from '../../../close'
import { balances } from '../../../ledger'

export default defineRoute({
  ability: 'finance.ledger.view',
  record: event => ['finance.period', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'default',
}, async (_event, { record, actor }) => {
  const period = await getPeriod(record!.id)
  if (!period) refuse('core.not-found', 'There is no such period.', { status: 404 })
  const on = { type: 'finance.period', id: period!.id }
  const moved = await balances({ periodId: period!.id })
  return {
    period: { ...period!, ...(await periodTotals(period!.id)) },
    blockers: await closeBlockers(period!),
    // Where the period's money came from and went: each income and expense account that moved,
    // as a positive figure (income is credits less debits, an expense debits less credits).
    movement: moved
      .filter(b => b.kind === 'income' || b.kind === 'expense')
      .map(b => ({ accountId: b.accountId, code: b.code, name: b.name, kind: b.kind as 'income' | 'expense', currency: b.currency, amountMinor: b.kind === 'income' ? -b.balanceMinor : b.balanceMinor }))
      .filter(m => m.amountMinor !== 0),
    // Money taken in the period that is not income yet (liabilities, as a positive figure), such as
    // tickets for performances still to come.
    held: moved
      .filter(b => b.kind === 'liability' && b.balanceMinor !== 0)
      .map(b => ({ accountId: b.accountId, code: b.code, name: b.name, currency: b.currency, amountMinor: -b.balanceMinor })),
    // A period still running is not blocked, only early: the screen says when it can be closed.
    ended: period!.endsOn < await today(),
    closableFrom: previousDate(period!.endsOn, -1),
    // What the viewer may do with it, so the screen offers only that.
    canClose: (await can(actor, 'finance.period.close', on)).allowed,
    canReopen: (await can(actor, 'finance.period.reopen', on)).allowed,
  }
})
