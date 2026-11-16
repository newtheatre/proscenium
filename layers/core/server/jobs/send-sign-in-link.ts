// Sends the sign-in email. The link and code arrive sealed; a link already used or expired is not sent.
import { defineJob, first, nowMs } from '#kit'
import { openValue } from '../identity/crypto'
import { sendSignInMessage } from '../identity/notify'

export default defineJob<{ tokenId: string, sealed: string }>(async (payload) => {
  const token = await first<{ used_at: number | null, expires_at: number }>('SELECT used_at, expires_at FROM core_account_tokens WHERE id = ?', payload.tokenId)
  if (!token || token.used_at || token.expires_at <= nowMs()) return
  const mail = await openValue<{ address: string, link: string, code: string }>('sign-in-mail', payload.sealed)
  if (!mail) throw new Error('The sign-in email could not be opened: CORE_SESSION_KEY may have changed')
  await sendSignInMessage({ address: mail.address, template: 'core.sign-in-link', variables: { link: mail.link, code: mail.code } })
})
