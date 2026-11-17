// How many credits are linked to the person. My account's "My credits" entry and section name it
// with hideEmpty, so they show only to someone who has been credited.
import type { Count } from '../../points/count'
import { myCreditCount } from '../../programme/credits'

export default {
  async value(actor) {
    if (actor.kind !== 'person' || !actor.accountId) return 0
    return myCreditCount(actor.accountId)
  },
} satisfies Count
