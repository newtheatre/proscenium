import { decodeWaitingListToken, encodeWaitingListToken } from '#shared/utils/waiting-list-tokens'

// Stateless by design, the same shape as `qr-tokens.ts`: a resend or a second email recomputes
// the identical signature from the entry id alone, so nothing extra is stored (D-113).

let key: Promise<CryptoKey> | undefined

// Memoised per isolate, as the QR signing key is: importing one is real work and the raw
// material never changes underneath a running worker.
function signingKey(): Promise<CryptoKey> {
  const raw = useRuntimeConfig().waitingListTokenSecret
  if (!raw) {
    throw createError({ statusCode: 500, statusMessage: 'Waiting-list token signing is not configured' })
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

async function sign(entryId: string): Promise<string> {
  const digest = await crypto.subtle.sign('HMAC', await signingKey(), new TextEncoder().encode(entryId))
  return base64url(digest)
}

export async function waitingListTokenFor(entryId: string): Promise<string> {
  return encodeWaitingListToken(entryId, await sign(entryId))
}

// Constant-time-ish: length is checked first (both are fixed-length base64url, so a mismatch
// there is not itself a timing leak), then every byte is compared regardless of an early miss.
function signaturesMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// The entry id a presented token names, or null for a forged or malformed one. The caller still
// has to check that id resolves to a real, current entry.
export async function verifyWaitingListToken(token: string): Promise<string | null> {
  const decoded = decodeWaitingListToken(token)
  if (!decoded) return null
  const expected = await sign(decoded.entryId)
  return signaturesMatch(expected, decoded.signature) ? decoded.entryId : null
}
