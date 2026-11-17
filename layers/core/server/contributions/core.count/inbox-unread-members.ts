// Unread messages on the members' side, beside the members' area's Inbox (C-30).
import type { Count } from '../../points/count'
import { unreadCount } from '../../notifications/inbox'

export default {
  async value(actor) {
    if (actor.kind !== 'person' || !actor.accountId) return 0
    return unreadCount(actor.accountId, 'members')
  },
} satisfies Count
