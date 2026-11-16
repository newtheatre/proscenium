// Values that open something for whoever holds them: a basket's token, an order's link, a desk code.
// Each is random, handed out once and stored only as its hash (Box office specification, part 2).
import { openSpecial, sealSpecial } from '#kit'

const REFERENCE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // not-policy: no 0, O, 1, I or L, which are misread aloud
const REFERENCE_LENGTH = 8 // not-policy: short enough to read out, long enough not to collide
const DESK_CODE_LENGTH = 10 // not-policy: long enough that guessing one is hopeless, short enough to type
const TOKEN_BYTES = 24 // not-policy: 192 random bits

const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** A random value for a link, unguessable. */
export function randomToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)))
}

/** The short booking reference a person reads out. It identifies an order and opens nothing. */
export function newReference(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(REFERENCE_LENGTH))
  return [...bytes].map(b => REFERENCE_ALPHABET[b % REFERENCE_ALPHABET.length]).join('')
}

/** The hash a token, link or code is stored and looked up by. */
export async function hashOf(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return base64url(new Uint8Array(digest))
}

/** The code a buyer shows at the desk to have a reservation found. It admits nobody. */
export function newDeskCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(DESK_CODE_LENGTH))
  return [...bytes].map(b => REFERENCE_ALPHABET[b % REFERENCE_ALPHABET.length]).join('')
}

/**
 * A value that carries its own contents, sealed with the site's key, for a link that must work
 * with nothing stored: only this site can make one or read one.
 */
export async function sealToken(contents: unknown): Promise<string> {
  return base64url(new TextEncoder().encode((await sealSpecial(JSON.stringify(contents)))!))
}

/** What a sealed token holds, or null if it is not one of ours. */
export async function openToken<T>(token: string): Promise<T | null> {
  try {
    const sealed = atob(token.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse((await openSpecial(sealed))!) as T
  }
  catch {
    return null
  }
}
