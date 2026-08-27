// RFC 6238 time-based one-time passwords, on Web Crypto so the same code runs in the worker and
// in a test. Six digits on a thirty second step (A-109).

export const TOTP_DIGITS = 6
export const TOTP_STEP_SECONDS = 30
// One step either side, so a clock a little out or a code typed slowly still works.
export const TOTP_TOLERANCE_STEPS = 1
export const TOTP_SECRET_BYTES = 20

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(encoded: string): Uint8Array {
  const clean = encoded.toUpperCase().replace(/[\s=-]/g, '')
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const character of clean) {
    const index = BASE32.indexOf(character)
    if (index === -1) throw new Error(`\`${character}\` is not base32`)
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return new Uint8Array(out)
}

export function generateSecret(): string {
  return base32Encode(crypto.getRandomValues(new Uint8Array(TOTP_SECRET_BYTES)))
}

export function stepFor(at: Date): number {
  return Math.floor(at.getTime() / 1000 / TOTP_STEP_SECONDS)
}

async function hmacSha1(key: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const imported = await crypto.subtle.importKey('raw', key as BufferSource, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', imported, message as BufferSource))
}

export async function codeForStep(secret: string, step: number): Promise<string> {
  const counter = new Uint8Array(8)
  // Big-endian, and written with BigInt so a step past 2^32 does not silently wrap.
  let remaining = BigInt(step)
  for (let index = 7; index >= 0; index--) {
    counter[index] = Number(remaining & 0xFFn)
    remaining >>= 8n
  }

  const digest = await hmacSha1(base32Decode(secret), counter)
  const offset = digest[digest.length - 1]! & 0x0F
  const truncated
    = ((digest[offset]! & 0x7F) << 24)
      | ((digest[offset + 1]! & 0xFF) << 16)
      | ((digest[offset + 2]! & 0xFF) << 8)
      | (digest[offset + 3]! & 0xFF)

  return String(truncated % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0')
}

export interface Acceptance { accepted: boolean, step: number | null }

// Accepts within the tolerance and reports which step matched, so the caller can refuse a
// replay of a code already spent (A-109 criterion 1).
export async function verifyCode(secret: string, code: string, at: Date, lastUsedStep: number | null): Promise<Acceptance> {
  const submitted = code.replace(/\s/g, '')
  if (!/^\d+$/.test(submitted) || submitted.length !== TOTP_DIGITS) return { accepted: false, step: null }

  const current = stepFor(at)
  for (let drift = -TOTP_TOLERANCE_STEPS; drift <= TOTP_TOLERANCE_STEPS; drift++) {
    const step = current + drift
    if (lastUsedStep !== null && step <= lastUsedStep) continue
    if (await codeForStep(secret, step) === submitted) return { accepted: true, step }
  }
  return { accepted: false, step: null }
}

// The otpauth URI an authenticator app reads from a QR code.
export function enrolmentUri(secret: string, account: string, issuer = 'Nottingham New Theatre'): string {
  const label = encodeURIComponent(`${issuer}:${account}`)
  const parameters = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  })
  return `otpauth://totp/${label}?${parameters.toString()}`
}
