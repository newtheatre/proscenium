// The fixture's crew calls, set by each test, with the account lists it was asked about.
import type { PersonBusy, PersonBusyItem } from '#modules/core'

export const crew: { calls: PersonBusyItem[], asked: string[][], fail: boolean, strangers: boolean } = { calls: [], asked: [], fail: false, strangers: false }

export default {
  async busy({ accountIds, from, to }) {
    crew.asked.push(accountIds)
    if (crew.fail) throw new Error('the fixture failed')
    return crew.calls.filter(c => (crew.strangers || accountIds.includes(c.accountId)) && c.from < to && c.to > from)
  },
} satisfies PersonBusy
