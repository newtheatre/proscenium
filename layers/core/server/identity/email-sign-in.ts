// Signing in by email (ID-01, ID-10): a link and a code, sent together. Asking for them reveals
// nothing about whether an account exists, writes no account, and is limited per address without
// saying so. The link works once; the code works once, only in the browser that asked, and dies
// after a few wrong tries. Neither can make a session strong.
import type { H3Event } from 'h3'
import { first, newId, nowMs, refuse, useContext, useSetting, type UnitView } from '#kit'
import { takeRate } from '#kit/ratelimit'
import { digest, randomCode, randomToken, sealValue, sameText } from './crypto'
import { addressRow, accountById, accountForProvenAddress, domainOf, normaliseAddress } from './accounts'
import { BROWSER_COOKIE, readCookie, relyingParty, setShortCookie } from './web'
import { startSession } from './sessions'

export interface TokenRow {
  id: string
  purpose: string
  token_hash: string
  code_hash: string | null
  browser_hash: string | null
  account_id: string | null
  address: string | null
  next_path: string | null
  attempts: number
  expires_at: number
  used_at: number | null
}

export type RequestOutcome = { sent: true } | { provider: 'google', to: string }

/** Is this address's domain one whose people sign in only through the provider? */
export async function isManaged(address: string): Promise<boolean> {
  const managed = await useSetting('core.sign-in.managed-domains') as string[]
  return managed.includes(domainOf(address))
}

/**
 * Asks for a link and code. Whatever happens, the caller shows the same "check your email" screen;
 * only a managed domain is sent to its provider, which says something about the domain and nothing
 * about any account.
 */
export async function requestEmailSignIn(unit: UnitView, event: H3Event, input: { address: string, next: string | null }): Promise<RequestOutcome> {
  const address = normaliseAddress(input.address)
  if (await isManaged(address)) {
    const query = new URLSearchParams({ login_hint: address, ...(input.next ? { next: input.next } : {}) })
    return { provider: 'google', to: `/api/core/sign-in/google?${query}` }
  }
  const quiet = { sent: true } as const
  if (!(await useSetting('core.sign-in.email-link'))) return quiet
  // The per-address limit: over it, the same screen and no email.
  if (!(await takeRate('sign-in', `address:${address}`))) return quiet

  const existing = await addressRow(address)
  if (!existing && !(await useSetting('core.sign-in.open-sign-up'))) return quiet

  let browser = readCookie(event, BROWSER_COOKIE)
  const lifetime = await useSetting('core.sign-in.link-lifetime') as number
  if (!browser || browser.length > 100) { // not-policy: a browser token is 43 characters
    browser = randomToken()
    setShortCookie(event, BROWSER_COOKIE, browser, lifetime)
  }
  const token = randomToken()
  const code = randomCode()
  const id = newId('tok', { random: true })
  const at = nowMs()
  unit.add({
    sql: `INSERT INTO core_account_tokens (id, purpose, token_hash, code_hash, browser_hash, account_id, address, next_path, attempts, created_at, expires_at)
          VALUES (?, 'sign_in', ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    params: [id, await digest('link', token), await digest('code', `${id}:${code}`), await digest('browser', browser), existing?.account_id ?? null, address, input.next, at, at + lifetime * 1000], // not-policy: seconds to milliseconds
  })
  const { origin } = relyingParty(event)
  unit.enqueue('core.send-sign-in-link', { tokenId: id, sealed: await sealValue('sign-in-mail', { address, link: `${origin}/sign-in/link#${token}`, code }) })
  return quiet
}

async function tokenByHash(hash: string): Promise<TokenRow | null> {
  // An invitation's link signs in exactly as a sign-in link does, and so claims the account.
  return first<TokenRow>('SELECT * FROM core_account_tokens WHERE token_hash = ? AND purpose IN (\'sign_in\', \'invite\')', hash)
}

export interface SignedIn { accountId: string, next: string | null, offerPasskey: boolean, created: boolean }

async function finish(unit: UnitView, event: H3Event, row: TokenRow, method: 'link' | 'code'): Promise<SignedIn> {
  const address = row.address!
  const existing = await addressRow(address)
  if (!existing && !(await useSetting('core.sign-in.open-sign-up')))
    refuse('core.sign-in.closed', 'This theatre is not taking new accounts at the moment.', { status: 403, remedy: 'If you were expecting an account, ask the theatre to add you.' })
  if (existing) {
    const account = await accountById(existing.account_id)
    if (account?.disabled_at) refuse('core.account.disabled', 'This account is disabled.', { status: 403, remedy: 'Contact the theatre to find out why.' })
    if (account?.merged_into_id || account?.anonymised_at) refuse('core.sign-in.link-unknown', 'This link is not valid.', { status: 410, remedy: 'Ask for a new email.' })
  }
  // Any other link or code still waiting for this address is spent too.
  unit.add({ sql: 'UPDATE core_account_tokens SET used_at = ? WHERE purpose = \'sign_in\' AND address = ? AND used_at IS NULL AND id <> ?', params: [nowMs(), address, row.id] })
  const { accountId, created } = await accountForProvenAddress(unit, address, 'self')
  await startSession(unit, event, { accountId, methods: [method], assurance: 'basic' })
  unit.audit({ action: 'sign-in', record: ['core.account', accountId], detail: { method } })
  const passkey = await first('SELECT 1 AS one FROM core_passkeys WHERE account_id = ? LIMIT 1', accountId)
  return { accountId, next: row.next_path, offerPasskey: !passkey, created }
}

/** Uses an emailed link. A second use, even a moment later in a race, signs nobody in. */
export async function useLink(unit: UnitView, event: H3Event, token: string): Promise<SignedIn> {
  const row = await tokenByHash(await digest('link', token))
  if (!row) refuse('core.sign-in.link-unknown', 'This link is not valid.', { status: 410, remedy: 'Ask for a new email.' })
  if (row.used_at) refuse('core.sign-in.link-used', 'This link has been used.', { status: 410, remedy: 'Ask for a new email if you need to sign in again.' })
  if (row.expires_at <= nowMs()) refuse('core.sign-in.link-expired', 'This link has expired.', { status: 410, remedy: 'Ask for a new email.' })
  unit.add({ sql: 'UPDATE core_account_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL', params: [nowMs(), row.id] })
    .expect(1, { code: 'core.sign-in.link-used', reason: 'This link has been used.', remedy: 'Ask for a new email if you need to sign in again.' })
  return finish(unit, event, row, 'link')
}

const WRONG = { code: 'core.sign-in.code-wrong', reason: 'That code is not right, or it has expired.', remedy: 'Check the code in the email, or ask for a new one.' }

/**
 * Uses an emailed code. It works only in the browser that asked for it; a wrong code, or the right
 * code from another browser, counts as a try, and the count is saved even though the request is
 * refused.
 */
export async function useCode(unit: UnitView, event: H3Event, input: { address: string, code: string }): Promise<SignedIn> {
  const address = normaliseAddress(input.address)
  const at = nowMs()
  const row = await first<TokenRow>(
    'SELECT * FROM core_account_tokens WHERE purpose = \'sign_in\' AND address = ? AND used_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1',
    address, at,
  )
  if (!row) refuse(WRONG.code, WRONG.reason, { status: 422, remedy: WRONG.remedy })
  const allowed = await useSetting('core.sign-in.code-attempts') as number
  if (row.attempts >= allowed) refuse('core.sign-in.code-spent', 'Too many wrong codes were tried.', { status: 422, remedy: 'Ask for a new email.' })
  const browser = readCookie(event, BROWSER_COOKIE)
  const browserOk = !!browser && !!row.browser_hash && sameText(await digest('browser', browser), row.browser_hash)
  const codeOk = !!row.code_hash && sameText(await digest('code', `${row.id}:${input.code.trim()}`), row.code_hash)
  if (!browserOk || !codeOk) {
    // Saved now, outside the request's unit, which a refusal never commits.
    await useContext().env.DB.prepare('UPDATE core_account_tokens SET attempts = attempts + 1 WHERE id = ?').bind(row.id).run()
    refuse(WRONG.code, WRONG.reason, { status: 422, remedy: WRONG.remedy })
  }
  unit.add({ sql: 'UPDATE core_account_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL AND attempts < ?', params: [at, row.id, allowed] })
    .expect(1, WRONG)
  return finish(unit, event, row, 'code')
}
