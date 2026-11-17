// What Box office knows that stops a period being closed: a performance that took place in it whose
// ticket money is still deferred, because the daily task has not yet moved it to income.
import type { PeriodCloseCheck } from '#modules/finance'
import { unrecognised } from '../../recognition'

export default {
  async blockers(period) {
    const waiting = await unrecognised({ from: period.startsAt, to: period.endsAt })
    if (!waiting.length) return []
    return [{
      sentence: waiting.length === 1
        ? 'A performance in this period has taken place and its ticket income has not been recognised yet.'
        : `${waiting.length} performances in this period have taken place and their ticket income has not been recognised yet.`,
    }]
  },
} satisfies PeriodCloseCheck
