// A membership whose renewal is open (R1), on My account's overview: the same moment the
// renewal-open reminder is sent, kept in sight until the person renews or the window closes.
import { all } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import type { AccountNoticeSource } from '#modules/core'
import { todayOrNull } from '../../memberships'
import { renewalWindow } from '../../renewal'

export default {
  async notices(actor) {
    if (actor.kind !== 'person' || !actor.accountId) return []
    const day = await todayOrNull()
    if (!day) return []
    const rows = await all<{ id: string, scheme_name: string, ends_on: string | null, grace_days: number, renewal_opens_days: number }>(
      `SELECT m.id, s.name AS scheme_name, m.ends_on, s.grace_days, s.renewal_opens_days
         FROM membership_memberships m JOIN membership_schemes s ON s.id = m.scheme_id
        WHERE m.account_id IN (${accountScopeSql('?1')}) AND m.state = 'active' AND s.state <> 'archived'
          AND NOT EXISTS (SELECT 1 FROM membership_memberships r WHERE r.renews_id = m.id AND r.state IN ('pending', 'active'))`,
      actor.accountId,
    )
    return rows.flatMap((r) => {
      const window = renewalWindow(r.ends_on, { renewalOpensDays: r.renewal_opens_days, graceDays: r.grace_days })
      if (!window || day < window.opensOn || day > window.closesOn) return []
      return [{
        id: r.id,
        tone: 'info' as const,
        icon: 'i-lucide-calendar-clock',
        title: 'membership.notices.renewal-open.title',
        description: 'membership.notices.renewal-open.description',
        params: { scheme: r.scheme_name },
        to: '/account/membership',
        action: 'membership.notices.renewal-open.action',
      }]
    })
  },
} satisfies AccountNoticeSource
