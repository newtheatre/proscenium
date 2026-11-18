// An award given before the holder ever signed in waits off the roll until they choose where it is
// listed: My account's overview asks them, once per award, until they answer on My awards.
import { all } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import type { AccountNoticeSource } from '#modules/core'

export default {
  async notices(actor) {
    if (actor.kind !== 'person' || !actor.accountId) return []
    const rows = await all<{ id: string, type_name: string }>(
      `SELECT a.id, t.name AS type_name FROM awards_awards a JOIN awards_types t ON t.id = a.type_id
        WHERE a.state = 'current' AND a.listing_pending = 1 AND a.account_id IN (${accountScopeSql('?1')}) ORDER BY a.awarded_on DESC`,
      actor.accountId,
    )
    return rows.map(r => ({
      id: r.id,
      tone: 'info' as const,
      icon: 'i-lucide-award',
      title: 'awards.notices.unlisted.title',
      description: 'awards.notices.unlisted.description',
      params: { award: r.type_name },
      to: '/account/awards',
      action: 'awards.notices.unlisted.action',
    }))
  },
} satisfies AccountNoticeSource
