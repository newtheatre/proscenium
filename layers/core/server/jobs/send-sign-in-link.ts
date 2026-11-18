// Sends the sign-in email. The link and code arrive sealed; a link already used or expired is not
// sent, and a retried job sends nothing twice.
import { defineJob, first, nowMs } from '#kit'
import { openValue } from '../identity/crypto'
import { notifyAddress } from '../notifications/send'

/** How long the link and code last, in words: "10 minutes", "1 hour". */
export function lifetimeWords(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000)) // not-policy: milliseconds to minutes
  if (minutes < 120 || minutes % 60) return minutes === 1 ? '1 minute' : `${minutes} minutes` // not-policy: hours read better from two upwards
  const hours = minutes / 60 // not-policy: minutes to hours
  return `${hours} hours`
}

export default defineJob<{ tokenId: string, sealed: string }>(async (payload, unit) => {
  const token = await first<{ used_at: number | null, created_at: number, expires_at: number }>('SELECT used_at, created_at, expires_at FROM core_account_tokens WHERE id = ?', payload.tokenId)
  if (!token || token.used_at || token.expires_at <= nowMs()) return
  const mail = await openValue<{ address: string, link: string, code: string }>('sign-in-mail', payload.sealed)
  if (!mail) throw new Error('The sign-in email could not be opened: CORE_SESSION_KEY may have changed')
  await notifyAddress(unit, 'core.sign-in-link', { address: mail.address, variables: { link: mail.link, code: mail.code, lasts: lifetimeWords(token.expires_at - token.created_at) }, dedupeKey: payload.tokenId })
})
