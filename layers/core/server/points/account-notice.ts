// Contract for core.account-notice: what on My account's overview needs the person asking. Each
// notice is words by translation key with their values, so the page says it in the person's
// language; `to` is where it is dealt with. A contribution that has nothing to say returns [].
import type { Actor } from '#kit'

export interface AccountNotice {
  /** Unique among the contribution's notices (an address id, a membership id). */
  id: string
  /** warning: something does not work until the person acts. info: something they can do now. */
  tone: 'warning' | 'info'
  icon: string
  title: string
  description?: string
  /** Values for the title and description. */
  params?: Record<string, string>
  to?: string
  /** The label of the link to `to`, by translation key. */
  action?: string
}

export interface AccountNoticeSource {
  notices: (actor: Actor) => Promise<AccountNotice[]>
}
