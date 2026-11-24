// Requests this person may decide, for the console's Requests entry. Their own are not counted.
import type { Actor } from '#kit'
import { decisionQueue } from '../../decisions'

export default {
  async value(actor: Actor) {
    return (await decisionQueue(actor)).filter(r => !r.own).length
  },
}
