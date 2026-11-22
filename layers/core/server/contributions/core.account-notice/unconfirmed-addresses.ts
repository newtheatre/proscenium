// An address the person added that does nothing until its link is used (ID-12): one notice each,
// pointing at Details, where the link can be sent again or the address removed.
import { all } from '#kit'
import type { AccountNoticeSource } from '../../points/account-notice'

export default {
  async notices(actor) {
    if (actor.kind !== 'person' || !actor.accountId) return []
    const rows = await all<{ id: string, address: string }>('SELECT id, address FROM core_account_emails WHERE account_id = ? AND verified_at IS NULL ORDER BY created_at', actor.accountId) // exact-account: identity's own table, read as Email addresses reads it, so the mark matches the page
    return rows.map(r => ({
      id: r.id,
      tone: 'warning' as const,
      icon: 'i-lucide-mail-warning',
      title: 'core.account.notices.unconfirmed.title',
      description: 'core.account.notices.unconfirmed.description',
      params: { address: r.address },
      to: '/account/details#email',
      action: 'core.account.notices.unconfirmed.action',
    }))
  },
} satisfies AccountNoticeSource
