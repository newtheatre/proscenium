/**
 * Signed, expiring access tokens for guest booking links; the booking
 * reference is not a credential (ADR-0009). Format: `<payload>.<HMAC>`.
 */

interface TokenPayload {
  /** Booking id. Named short because this rides in a URL. */
  b: string
  /** Expiry, unix seconds. */
  e: number
}

/** A week, as a floor: a booking made the day before still needs a usable link. */
const MIN_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000
/** A day past the performance, so the page still opens on the night. */
const GRACE_AFTER_PERFORMANCE_MS = 24 * 60 * 60 * 1000

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function secret(): string {
  const config = useRuntimeConfig()
  // Falls back to the session password. Set bookingTokenSecret in production to
  // rotate booking links independently of the estate seal (ADR-0009).
  const value = config.bookingTokenSecret || (config as { session?: { password?: string } }).session?.password
  if (!value) {
    throw createError({ statusCode: 500, statusMessage: 'Booking token secret is not configured' })
  }
  return value
}

async function key(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

/**
 * A day after the performance, but never less than a week away: the
 * credential stops working once it can no longer be acted on.
 */
export function bookingTokenExpiry(performanceStartsAt: Date, now = new Date()): number {
  const afterPerformance = performanceStartsAt.getTime() + GRACE_AFTER_PERFORMANCE_MS
  return Math.floor(Math.max(afterPerformance, now.getTime() + MIN_LIFETIME_MS) / 1000)
}

export async function signBookingToken(bookingId: string, expiresAt: number): Promise<string> {
  const payload: TokenPayload = { b: bookingId, e: expiresAt }
  const encoded = b64url(new TextEncoder().encode(JSON.stringify(payload)))
  const signature = await crypto.subtle.sign('HMAC', await key(), new TextEncoder().encode(encoded))
  return `${encoded}.${b64url(new Uint8Array(signature))}`
}

/**
 * Null for every failure (bad shape, signature, expiry or booking) so a
 * caller cannot tell which of them it was.
 */
export async function verifyBookingToken(token: string, bookingId: string, now = new Date()): Promise<boolean> {
  const separator = token.lastIndexOf('.')
  if (separator <= 0) return false

  const encoded = token.slice(0, separator)
  const signature = token.slice(separator + 1)

  let valid: boolean
  try {
    valid = await crypto.subtle.verify(
      'HMAC',
      await key(),
      b64urlDecode(signature),
      new TextEncoder().encode(encoded),
    )
  }
  catch {
    return false
  }
  if (!valid) return false

  let payload: TokenPayload
  try {
    payload = JSON.parse(new TextDecoder().decode(b64urlDecode(encoded))) as TokenPayload
  }
  catch {
    return false
  }

  if (payload.b !== bookingId) return false
  if (typeof payload.e !== 'number' || payload.e * 1000 <= now.getTime()) return false

  return true
}
