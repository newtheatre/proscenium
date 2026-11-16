// Sends an invitation (ID-06). The link arrives sealed; an invitation already used or lapsed is
// not sent, and a retried job sends nothing twice.
import { defineJob, first, nowMs } from '#kit'
import { openValue } from '../identity/crypto'
import { notifyAddress } from '../notifications/send'

export default defineJob<{ tokenId: string, sealed: string }>(async (payload, unit) => {
  const token = await first<{ used_at: number | null, expires_at: number }>('SELECT used_at, expires_at FROM core_account_tokens WHERE id = ?', payload.tokenId)
  if (!token || token.used_at || token.expires_at <= nowMs()) return
  const mail = await openValue<{ address: string, link: string, role: string }>('invitation-mail', payload.sealed)
  if (!mail) throw new Error('The invitation could not be opened: CORE_SESSION_KEY may have changed')
  await notifyAddress(unit, 'core.invitation', { address: mail.address, variables: { link: mail.link, role: mail.role }, dedupeKey: payload.tokenId })
})
