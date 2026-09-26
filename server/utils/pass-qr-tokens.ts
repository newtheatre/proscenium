import type { H3Event } from 'h3'

// A pass's own QR (D-124 criterion 5), reusing D-108's signing scheme: `pass:` domain-separates
// a pass id from a reservation id, so neither token resolves against the other's route.
const DOMAIN = 'pass:'

export const PASS_QR_COOKIE_NAME = 'nnt-pass-token'
export const PASS_QR_COOKIE_MAX_AGE_SECONDS = 60 * 60

// The path has to match the pass link route's own, or the browser keeps the cookie.
export function forgetPassQrToken(event: H3Event): void {
  deleteCookie(event, PASS_QR_COOKIE_NAME, { path: '/' })
}

export async function passQrTokenFor(passId: string): Promise<string> {
  return qrTokenFor(DOMAIN + passId)
}

// The pass id a presented token names, or null for a forged token, a malformed one, or a
// reservation's own token presented here by mistake.
export async function verifyPassQrToken(token: string): Promise<string | null> {
  const decoded = await verifyQrToken(token)
  return decoded?.startsWith(DOMAIN) ? decoded.slice(DOMAIN.length) : null
}
