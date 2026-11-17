// Recognising ticket income (Box office specification, part 3, "The ledger"). Ticket money is
// credited to deferred ticket income when it is paid and moved to ticket income only once the
// performance has taken place, by the daily task and by nothing else, so advance sales for a show
// that is later cancelled are never reported as income. What is moved is whatever is still deferred
// for the performance, so a sale or refund posted after it took place is carried on the next run.
import { all, nowMs, today, type UnitView } from '#kit'
import { listPerformances } from '#modules/core'
import { balances, postEntries } from '#modules/finance'

const DEFERRED = 'box-office.deferred-ticket-income'
const INCOME = 'box-office.ticket-income'
const LOOK_BACK = 90 * 86_400_000 // not-policy: how far back a run looks for performances that have taken place, in milliseconds

export interface Unrecognised { performanceId: string, productionId: string, deferredMinor: number, currency: string }

/** Performances sold here that have taken place in the window and still have ticket money deferred. */
export async function unrecognised(window: { from: number, to?: number } = { from: nowMs() - LOOK_BACK }): Promise<Unrecognised[]> {
  const sold = new Set((await all<{ performance_id: string }>('SELECT performance_id FROM box_office_performance_sales')).map(r => r.performance_id))
  const done = (await listPerformances({ state: 'completed', from: window.from, to: window.to })).filter(p => sold.has(p.id))
  const out: Unrecognised[] = []
  for (const performance of done) {
    for (const balance of await balances({ systemKeys: [DEFERRED], performanceId: performance.id })) {
      // A liability's balance is a credit, so what is owed shows as a negative number here.
      if (balance.balanceMinor !== 0) out.push({ performanceId: performance.id, productionId: performance.productionId, deferredMinor: -balance.balanceMinor, currency: balance.currency })
    }
  }
  return out
}

/** Posts the move from deferred to income for one performance. Once a day at most, by its key. */
export async function recognise(unit: UnitView, due: Unrecognised): Promise<string> {
  const tags = { performanceId: due.performanceId, productionId: due.productionId }
  return postEntries(unit, {
    key: `box-office:performance:${due.performanceId}:recognised:${await today()}`,
    source: { module: 'box-office', type: 'performance', id: due.performanceId },
    kind: 'recognition',
    currency: due.currency,
    postedBy: null,
    entries: [
      { account: { key: DEFERRED }, amountMinor: due.deferredMinor, ...tags },
      { account: { key: INCOME }, amountMinor: -due.deferredMinor, ...tags },
    ],
  })
}
