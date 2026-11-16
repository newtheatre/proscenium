import { z } from 'zod'

// Every id is `<prefix>_<26 characters>`: 10 characters of creation time in milliseconds, then 16
// random ones. The alphabet is Flytower's base32 set in ASCII order, so ids sort by creation time.
// A table may ask for `random: true`, which hides the moment of creation. An id is never a secret.
const ALPHABET = '234567abcdefghijklmnopqrstuvwxyz'
const TIME_CHARS = 10 // not-policy: 50 bits hold any millisecond timestamp
const BODY_CHARS = 26 // not-policy: the id format

export const ID_PREFIX = /^[a-z]{2,4}$/

function randomChars(count: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(count))
  let out = ''
  // 256 is a multiple of 32, so the low five bits keep every character equally likely.
  for (const byte of bytes) out += ALPHABET[byte & 31]
  return out
}

function timeChars(ms: number): string {
  let out = ''
  let rest = Math.floor(ms)
  for (let i = 0; i < TIME_CHARS; i++) {
    out = ALPHABET[rest % 32] + out
    rest = Math.floor(rest / 32)
  }
  return out
}

/** A new id for a table whose prefix is `prefix`, such as `ord_2b7…`. */
export function newId(prefix: string, options: { random?: boolean, at?: number } = {}): string {
  if (!ID_PREFIX.test(prefix)) throw new Error(`"${prefix}" is not an id prefix: two to four lower-case letters`)
  const body = options.random
    ? randomChars(BODY_CHARS)
    : timeChars(options.at ?? Date.now()) + randomChars(BODY_CHARS - TIME_CHARS)
  return `${prefix}_${body}`
}

export function isId(prefix: string, value: unknown): value is string {
  return typeof value === 'string' && new RegExp(`^${prefix}_[2-7a-z]{${BODY_CHARS}}$`).test(value)
}

/** A Zod schema that accepts only ids with this prefix, for route input. */
export function idSchema(prefix: string) {
  return z.string().regex(new RegExp(`^${prefix}_[2-7a-z]{${BODY_CHARS}}$`), `an id starting ${prefix}_`)
}

/** The time encoded in a time-sorted id. */
export function idTime(id: string): number {
  const body = id.slice(id.indexOf('_') + 1, id.indexOf('_') + 1 + TIME_CHARS)
  let ms = 0
  for (const char of body) ms = ms * 32 + ALPHABET.indexOf(char)
  return ms
}
