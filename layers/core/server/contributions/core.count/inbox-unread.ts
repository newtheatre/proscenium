// Unread messages on the audience side, beside My account's Inbox (C-30).
import type { Count } from '../../points/count'
import { unreadCount } from '../../notifications/inbox'

export default {
  async value(actor) {
    if (actor.kind !== 'person' || !actor.accountId) return 0
    return unreadCount(actor.accountId, 'audience')
  },
} satisfies Count
