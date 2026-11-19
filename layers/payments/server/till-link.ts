// Linking tills across accounts (linked tills proposal, 19 November 2026). A seller's own devices
// share a sale by themselves; someone else's joins by typing a short code shown on one of them. The
// code is held for two minutes (#kit/realtime, holdUnder) and buys a pass to the seller's realtime
// room for the rest of the shift. The pass carries no money and no authority: every sale and payment
// is still made through the routes, as the person signed in on the device that makes it.
import { nowMs, Refusal } from '#kit'
import { accountRoom, heldUnder, holdUnder, realtimeAvailable, signGrant } from '#kit/realtime'
import { accountLabel } from '#modules/core'

export const CODE_LIFE = 2 * 60_000 // not-policy: how long a link code can be typed for
export const LINK_LIFE = 12 * 60 * 60_000 // not-policy: a link lasts a shift, then is made again
const CODE_DIGITS = 6 // not-policy: short enough to read aloud
const TRIES = 5 // not-policy: codes in use are few; a clash twice running is already unlikely

function digits(): string {
  const [n] = crypto.getRandomValues(new Uint32Array(1))
  return String(n! % 10 ** CODE_DIGITS).padStart(CODE_DIGITS, '0') // not-policy: decimal digits
}

const unavailable = () => new Refusal('payments.till.link-unavailable', 'This site cannot link tills.', { status: 409 })

/** A code another seller can type on their device to join this seller's till. */
export async function offerLink(accountId: string): Promise<{ code: string, expiresAt: number }> {
  if (!realtimeAvailable()) throw unavailable()
  const expiresAt = nowMs() + CODE_LIFE
  for (let i = 0; i < TRIES; i++) {
    const code = digits()
    if (await holdUnder(code, accountId, expiresAt)) return { code, expiresAt }
  }
  throw unavailable()
}

/** The pass a typed code buys: to the room of the seller who showed it, for this account only. */
export async function acceptLink(code: string, accountId: string): Promise<{ grant: string, name: string, expiresAt: number }> {
  if (!realtimeAvailable()) throw unavailable()
  const host = await heldUnder(code)
  if (!host) throw new Refusal('payments.till.link-code-unknown', 'That code is not right, or has run out.', { status: 404, remedy: 'Ask for a new code and try again.' })
  if (host === accountId) throw new Refusal('payments.till.link-own', 'This device is signed in as the same person, so it is linked already.', { status: 409 })
  const expiresAt = nowMs() + LINK_LIFE
  return { grant: await signGrant({ room: accountRoom(host), accountId, expires: expiresAt }), name: await accountLabel(host), expiresAt }
}
