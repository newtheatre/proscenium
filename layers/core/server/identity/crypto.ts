// The secrets identity hands out and the hashes it keeps. Every token, code and session id is
// random, sent to the person once, and stored only as an HMAC keyed with CORE_SESSION_KEY, so a
// copy of the database signs nobody in (ID-10).
import { useContext } from '#kit/context'

const encoder = new TextEncoder()
const TOKEN_BYTES = 32 // not-policy: 256 bits of randomness
const IV_BYTES = 12 // not-policy: AES-GCM nonce length
/** Codes are read aloud and typed: digits only. */
const CODE_DIGITS = 6 // not-policy: the length people expect of a one-time code
/** Recovery codes avoid letters that look alike. */
const RECOVERY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
const RECOVERY_LENGTH = 10 // not-policy: two groups of five, about 49 bits

export function sessionKey(): string {
  const value = useContext().env.CORE_SESSION_KEY
  if (typeof value !== 'string' || !value) throw new Error('CORE_SESSION_KEY is not set. Add it as a Worker secret (any long random string).')
  return value
}

export function hasSessionKey(): boolean {
  const value = useContext().env.CORE_SESSION_KEY
  return typeof value === 'string' && value.length > 0
}

export function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromBase64url(text: string): Uint8Array<ArrayBuffer> {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4) // not-policy: base64 padding
  const binary = atob(padded)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function randomToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)))
}

export function randomCode(): string {
  const values = crypto.getRandomValues(new Uint32Array(CODE_DIGITS))
  return [...values].map(v => String(v % 10)).join('') // not-policy: decimal digits
}

export function randomRecoveryCode(): string {
  const values = crypto.getRandomValues(new Uint32Array(RECOVERY_LENGTH))
  const chars = [...values].map(v => RECOVERY_ALPHABET[v % RECOVERY_ALPHABET.length]).join('')
  return `${chars.slice(0, RECOVERY_LENGTH / 2)}-${chars.slice(RECOVERY_LENGTH / 2)}`
}

/** Recovery codes are compared without their dash, spaces or case. */
export function normaliseRecoveryCode(code: string): string {
  const plain = code.toLowerCase().replace(/[^a-z0-9]/g, '') // not-policy: characters a code may hold
  return plain.length === RECOVERY_LENGTH ? `${plain.slice(0, RECOVERY_LENGTH / 2)}-${plain.slice(RECOVERY_LENGTH / 2)}` : plain
}

const keys = new Map<string, Promise<CryptoKey>>()

function hmacKey(purpose: string): Promise<CryptoKey> {
  const secret = sessionKey()
  const id = `${purpose}:${secret}`
  let key = keys.get(id)
  if (!key) {
    key = crypto.subtle.importKey('raw', encoder.encode(`${purpose}\u0000${secret}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    keys.set(id, key)
  }
  return key
}

/** The keyed hash identity stores in place of a secret. `purpose` separates the uses. */
export async function digest(purpose: string, value: string): Promise<string> {
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(purpose), encoder.encode(value))
  return base64url(new Uint8Array(signature))
}

/** Compares two strings in time that does not depend on where they differ. */
export function sameText(a: string, b: string): boolean {
  const left = encoder.encode(a)
  const right = encoder.encode(b)
  let difference = left.length ^ right.length
  for (let i = 0; i < Math.max(left.length, right.length); i++) difference |= (left[i] ?? 0) ^ (right[i] ?? 0)
  return difference === 0
}

async function sealingKey(purpose: string): Promise<CryptoKey> {
  const material = await crypto.subtle.digest('SHA-256', encoder.encode(`seal:${purpose}\u0000${sessionKey()}`))
  return crypto.subtle.importKey('raw', material, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

/** Encrypts a short value (a job's link and code, a ticket kept in a cookie) for identity alone. */
export async function sealValue(purpose: string, value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await sealingKey(purpose), encoder.encode(JSON.stringify(value))))
  return `${base64url(iv)}.${base64url(cipher)}`
}

/** Opens a sealed value, or answers null if it was tampered with or sealed for something else. */
export async function openValue<T>(purpose: string, sealed: string | undefined | null): Promise<T | null> {
  if (!sealed) return null
  const [iv, cipher] = sealed.split('.')
  if (!iv || !cipher) return null
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64url(iv) }, await sealingKey(purpose), fromBase64url(cipher))
    return JSON.parse(new TextDecoder().decode(plain)) as T
  }
  catch {
    return null
  }
}
