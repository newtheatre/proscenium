// An authenticator app (TOTP, RFC 6238): six digits every thirty seconds from a shared secret. It is
// a second way to confirm it is you, offered to people whose roles reach the console, and never a way
// to sign in on its own. After an email or Google sign-in, a code from it makes the session strong when
// `core.sign-in.authenticator-is-strong` is on: the inbox (or the Google account) and the phone app
// are two separate things, a fair stand-in for a passkey on a shared box office laptop.
//
// Each code works once: the step it was accepted for is stored, and an earlier or equal step is
// refused. One step either side of now is accepted, for a clock that has drifted.
import { first, newId, nowMs, openColumn, refuse, sealColumn, useSetting, type UnitView } from '#kit'
import { countAgainstRate } from '#kit/ratelimit'
import { sameText } from './crypto'
import { holdsPrivileged } from './me'
import { reassert, type CurrentSession } from './sessions'

const STEP_SECONDS = 30 // not-policy: RFC 6238's time step, which every authenticator app uses
const DIGITS = 6 // not-policy: the length every authenticator app shows
const SECRET_BYTES = 20 // not-policy: 160 bits, RFC 4226's recommended secret length
const DRIFT_STEPS = 1 // not-policy: one step either side, for a clock a little out
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of bytes) {
    value = (value << 8) | byte // not-policy: a byte's bits
    bits += 8 // not-policy: a byte's bits
    while (bits >= 5) { // not-policy: base32 takes five bits a character
      out += BASE32[(value >>> (bits - 5)) & 31] // not-policy: five bits
      bits -= 5 // not-policy: five bits
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31] // not-policy: the last part-character
  return out
}

export function fromBase32(text: string): Uint8Array<ArrayBuffer> {
  const clean = text.toUpperCase().replace(/[^A-Z2-7]/g, '') // not-policy: the base32 alphabet
  const out: number[] = []
  let bits = 0
  let value = 0
  for (const char of clean) {
    value = (value << 5) | BASE32.indexOf(char) // not-policy: five bits a character
    bits += 5 // not-policy: five bits a character
    if (bits >= 8) { // not-policy: a whole byte
      out.push((value >>> (bits - 8)) & 255) // not-policy: a byte
      bits -= 8 // not-policy: a byte
    }
  }
  return new Uint8Array(out)
}

/** The code an app shows for a secret at a step (RFC 4226 HOTP over HMAC-SHA-1). */
export async function codeAt(secret: Uint8Array<ArrayBuffer>, step: number): Promise<string> {
  const counter = new Uint8Array(8) // not-policy: HOTP's eight-byte counter
  let n = step
  for (let i = 7; i >= 0; i--) { // not-policy: big-endian, last byte first
    counter[i] = n & 255 // not-policy: a byte
    n = Math.floor(n / 256) // not-policy: next byte
  }
  const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, counter))
  const offset = mac[mac.length - 1]! & 15 // not-policy: RFC 4226 dynamic truncation
  const binary = ((mac[offset]! & 127) << 24) | (mac[offset + 1]! << 16) | (mac[offset + 2]! << 8) | mac[offset + 3]! // not-policy: RFC 4226 dynamic truncation
  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0') // not-policy: decimal digits
}

export const stepAt = (ms: number) => Math.floor(ms / 1000 / STEP_SECONDS) // not-policy: milliseconds to steps

interface Row { id: string, secret_sealed: string, last_step: number, confirmed_at: number | null }

async function rowOf(accountId: string): Promise<Row | null> {
  return first<Row>('SELECT id, secret_sealed, last_step, confirmed_at FROM core_authenticators WHERE account_id = ?', accountId) // exact-account: identity's own table, keyed by the living account
}

/** Whether this account may add an authenticator: the theatre offers it, and the person's roles reach the console. */
export async function authenticatorOffered(accountId: string): Promise<boolean> {
  return !!(await useSetting('core.sign-in.authenticator')) && holdsPrivileged(accountId)
}

/** The account's authenticator, if it has a working one. */
export async function authenticatorOf(accountId: string): Promise<{ addedAt: number } | null> {
  const row = await rowOf(accountId)
  return row?.confirmed_at && (await useSetting('core.sign-in.authenticator')) ? { addedAt: row.confirmed_at } : null
}

/**
 * Starts setting one up: a new secret, kept sealed and not yet confirmed, replacing any set-up that
 * was not finished. Refused while a working one exists; the person removes it first.
 */
export async function startAuthenticator(unit: UnitView, accountId: string, label: { site: string, account: string }): Promise<{ secret: string, uri: string }> {
  if (!(await authenticatorOffered(accountId))) refuse('core.authenticator.not-offered', 'An authenticator app is not offered for this account.', { status: 409, remedy: 'It is for people whose roles reach the console.' })
  const existing = await rowOf(accountId)
  if (existing?.confirmed_at) refuse('core.authenticator.exists', 'You already have an authenticator app.', { status: 409, remedy: 'Remove it first to set up another.' })
  const secret = base32(crypto.getRandomValues(new Uint8Array(SECRET_BYTES)))
  if (existing) unit.add({ sql: 'DELETE FROM core_authenticators WHERE id = ? AND confirmed_at IS NULL', params: [existing.id] })
  unit.add({
    sql: 'INSERT INTO core_authenticators (id, account_id, secret_sealed, last_step, created_at) VALUES (?, ?, ?, 0, ?)',
    params: [newId('aut', { random: true }), accountId, await sealColumn(secret), nowMs()],
  })
  const issuer = encodeURIComponent(label.site)
  const uri = `otpauth://totp/${issuer}:${encodeURIComponent(label.account)}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`
  return { secret, uri }
}

const WRONG = { code: 'core.authenticator.code-wrong', reason: 'That code is not right.', remedy: 'Type the code the app shows now. If it keeps failing, check the time on your phone is set automatically.' }

/**
 * Checks a code against the account's authenticator and spends its step. `pending` checks the set-up
 * waiting for its first code instead of a working one. Tries are limited per account, without saying so.
 */
async function spend(unit: UnitView, accountId: string, code: string, pending: boolean): Promise<string> {
  const row = await rowOf(accountId)
  if (!row || !!row.confirmed_at === pending) refuse(WRONG.code, WRONG.reason, { status: 422, remedy: WRONG.remedy })
  if (!(await countAgainstRate('sign-in', `authenticator:${accountId}`)).allowed) refuse(WRONG.code, WRONG.reason, { status: 422, remedy: WRONG.remedy })
  const secret = fromBase32((await openColumn(row.secret_sealed))!)
  const now = stepAt(nowMs())
  let matched: number | null = null
  for (let step = now - DRIFT_STEPS; step <= now + DRIFT_STEPS; step++) {
    if (step > row.last_step && sameText(await codeAt(secret, step), code.trim())) matched = step
  }
  if (matched === null) refuse(WRONG.code, WRONG.reason, { status: 422, remedy: WRONG.remedy, fields: { code: 'wrong' } })
  // The conditional write decides a race: the same code sent twice at once works once.
  unit.add({ sql: 'UPDATE core_authenticators SET last_step = ?, last_used_at = ? WHERE id = ? AND last_step < ?', params: [matched, nowMs(), row.id, matched] })
    .expect(1, WRONG)
  return row.id
}

/** Finishes setting one up with its first code. */
export async function confirmAuthenticator(unit: UnitView, accountId: string, code: string): Promise<void> {
  const id = await spend(unit, accountId, code, true)
  unit.add({ sql: 'UPDATE core_authenticators SET confirmed_at = ? WHERE id = ? AND confirmed_at IS NULL', params: [nowMs(), id] }).expect(1)
}

export function removeAuthenticator(unit: UnitView, accountId: string): void {
  unit.add({ sql: 'DELETE FROM core_authenticators WHERE account_id = ?', params: [accountId] })
}

/** Whether a code from the app makes this session strong, rather than only fresh. */
export async function authenticatorMakesStrong(session: CurrentSession): Promise<boolean> {
  if (session.assurance === 'strong') return true
  return !session.limited && !!(await useSetting('core.sign-in.authenticator-is-strong'))
}

/** Confirms it is you with a code from the app (ID-28). */
export async function confirmWithAuthenticator(unit: UnitView, session: CurrentSession, code: string): Promise<{ reasserted: true, strong: boolean }> {
  if (session.limited || !(await authenticatorOf(session.accountId))) refuse('core.reassert.authenticator-not-offered', 'This sign-in cannot be confirmed with an authenticator app.', { status: 409, remedy: 'Use your passkey.' })
  await spend(unit, session.accountId, code, false)
  const strong = await authenticatorMakesStrong(session)
  reassert(unit, session.id, 'authenticator', strong)
  unit.audit({ action: 'sign-in', record: ['core.account', session.accountId], detail: { method: 'authenticator', reassert: true, strong } })
  return { reasserted: true, strong }
}
