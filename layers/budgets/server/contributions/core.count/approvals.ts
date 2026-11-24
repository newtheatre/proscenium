// How many requests and claims wait on the person, beside Approvals: on budgets they hold, or every
// one for the treasurer. The entry is hideEmpty, so it shows only while something waits.
import type { Actor } from '#kit'
import { waitingOn } from '../../requests'
import { claimsWaitingOn } from '../../claim-decisions'

export default {
  async value(actor: Actor) {
    return (await waitingOn(actor)).length + (await claimsWaitingOn(actor)).length
  },
}
