// Unread messages in the person's one inbox (C-30, AC-2): every side they have, the same number
// the bell shows, wherever the inbox is listed.
import type { Count } from '../../points/count'
import { isMember } from '../../interface/viewer'
import { sidesOf, unreadCount } from '../../notifications/inbox'

export default {
  async value(actor) {
    if (actor.kind !== 'person' || !actor.accountId) return 0
    return unreadCount(actor.accountId, sidesOf(await isMember(actor)))
  },
} satisfies Count
