// How many optional kinds of message the person may choose between: My account shows Notifications
// only to somebody with a choice to make.
import type { Count } from '../../points/count'
import { isMember } from '../../interface/viewer'
import { topicsFor } from '../../notifications/preferences'

export default {
  async value(actor) {
    if (actor.kind !== 'person' || !actor.accountId) return 0
    return (await topicsFor(actor.accountId, await isMember(actor))).length
  },
} satisfies Count
