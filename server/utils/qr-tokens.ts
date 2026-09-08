import { decodeQrToken, encodeQrToken } from '#shared/utils/qr-tokens'

// Stateless by design: a resend recomputes the identical signature from the reservation id
// alone, so nothing is stored and nothing can leak from a backup (D-108 criterion 1).

// The cookie a browser exchange leaves behind, so the token itself stops sitting in the
// address bar and any referrer header after the first open (D-108 criterion 4).
export const QR_COOKIE_NAME = 'nnt-qr-token'
export const QR_COOKIE_MAX_AGE_SECONDS = 60 * 60

let key: Promise<CryptoKey> | undefined

// Memoised per isolate, as the access-profile key is: importing one is real work and the raw
// material never changes underneath a running worker.
function signingKey(): Promise<CryptoKey> {
  const raw = useRuntimeConfig().qrTokenSecret
  if (!raw) {
    throw createError({ statusCode: 500, statusMessage: 'QR token signing is not configured' })
  }
  key ??= crypto.subtle.importKey(
    'raw',
    Uint8Array.from(atob(raw), char => char.charCodeAt(0)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return key
}

function base64url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

async function sign(reservationId: string): Promise<string> {
  const digest = await crypto.subtle.sign('HMAC', await signingKey(), new TextEncoder().encode(reservationId))
  return base64url(digest)
}

export async function qrTokenFor(reservationId: string): Promise<string> {
  return encodeQrToken(reservationId, await sign(reservationId))
}

// Constant-time-ish: length is checked first (both are fixed-length base64url, so a mismatch
// there is not itself a timing leak), then every byte is compared regardless of an early miss.
function signaturesMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// The reservation id a presented token names, or null for a forged or malformed one. The
// caller still has to check that id resolves to a real, current reservation.
export async function verifyQrToken(token: string): Promise<string | null> {
  const decoded = decodeQrToken(token)
  if (!decoded) return null
  const expected = await sign(decoded.reservationId)
  return signaturesMatch(expected, decoded.signature) ? decoded.reservationId : null
}
