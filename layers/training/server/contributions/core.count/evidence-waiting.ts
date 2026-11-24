// K9's menu count: evidence waiting on courses where this person checks it.
import type { Actor } from '#kit'
import { evidenceQueue } from '../../evidence'

export default {
  value: async (actor: Actor) => (await evidenceQueue(actor)).length,
}
