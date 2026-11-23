// The passkey offer for somebody with none (ID-03): a notice on My account's overview that leads to
// Signing in, in place of a screen after every sign-in. The overview lets the person put it away.
import { first } from '#kit'
import type { AccountNoticeSource } from '../../points/account-notice'

export default {
  async notices(actor) {
    if (actor.kind !== 'person' || !actor.accountId) return []
    if (await first('SELECT 1 AS one FROM core_passkeys WHERE account_id = ? LIMIT 1', actor.accountId)) return [] // exact-account: identity's own table, as Signing in reads it
    return [{
      id: 'offer',
      tone: 'info' as const,
      icon: 'i-lucide-key-round',
      title: 'core.account.notices.passkey.title',
      description: 'core.account.notices.passkey.description',
      to: '/account/sign-in',
      action: 'core.account.notices.passkey.action',
    }]
  },
} satisfies AccountNoticeSource
