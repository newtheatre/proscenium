// Confirming it is you in place (ID-28; part 3, "How the dialogue confirms"). The method must be as
// strong as the session: a strong session confirms with a passkey, never by email. A basic session on
// an account with no passkey may confirm with a six-digit code sent to its audience address: single
// use, short-lived, tied to the session that asked, with limited tries. The code only refreshes the
// session (reasserted_at); it never raises its assurance.
import { first, newId, nowMs, refuse, useContext, useSetting, type UnitView } from '#kit'
import { notify } from '../notifications/notify'
import { addressFor } from './addresses'
import { digest, randomCode, randomToken, sameText } from './crypto'
import type { TokenRow } from './email-sign-in'
import { passkeyCount } from './passkeys'
import { reassert, type CurrentSession } from './sessions'

export type Way = 'passkey' | 'code'

/** How this session may confirm: a passkey if the account has one, the code only for a basic session. */
export async function waysToConfirm(session: CurrentSession): Promise<{ ways: Way[], address: string | null }> {
  const ways: Way[] = []
  if (await passkeyCount(session.accountId)) ways.push('passkey')
  const address = session.assurance === 'basic' && !ways.length ? await addressFor(session.accountId, 'audience') : null
  if (address) ways.push('code')
  return { ways, address: address ? masked(address) : null }
}

/** "m•••@example.org": enough to know which inbox, not enough to read it off a shoulder. */
function masked(address: string): string {
  const at = address.lastIndexOf('@')
  return `${address.slice(0, 1)}•••${address.slice(at)}`
}

const CODE_WRONG = { code: 'core.reassert.code-wrong', reason: 'That code is not right, or it has expired.', remedy: 'Check the code in the email, or ask for a new one.' }
const sessionKey = (session: CurrentSession) => digest('browser', `reassert:${session.id}`)

/** Sends a code for this session to the account's audience address. */
export async function sendCode(unit: UnitView, session: CurrentSession): Promise<{ sent: true }> {
  const { ways } = await waysToConfirm(session)
  if (!ways.includes('code')) refuse('core.reassert.code-not-offered', 'This sign-in cannot be confirmed by email.', { status: 409, remedy: 'Use your passkey.' })
  const id = newId('tok', { random: true })
  const code = randomCode()
  const at = nowMs()
  const lifetime = await useSetting('core.sign-in.link-lifetime') as number
  // A newer code replaces any still waiting for this session.
  unit.add({ sql: 'UPDATE core_account_tokens SET used_at = ? WHERE purpose = \'reassert\' AND account_id = ? AND used_at IS NULL', params: [at, session.accountId] })
  unit.add({
    sql: `INSERT INTO core_account_tokens (id, purpose, token_hash, code_hash, browser_hash, account_id, attempts, created_at, expires_at)
          VALUES (?, 'reassert', ?, ?, ?, ?, 0, ?, ?)`,
    params: [id, await digest('link', randomToken()), await digest('code', `${id}:${code}`), await sessionKey(session), session.accountId, at, at + lifetime * 1000], // not-policy: seconds to milliseconds
  })
  await notify(unit, 'core.reassert-code', { to: session.accountId, variables: { code }, dedupeKey: id })
  return { sent: true }
}

/** Checks a code; a wrong one counts as a try, saved even though the request is refused. */
export async function confirmWithCode(unit: UnitView, session: CurrentSession, code: string): Promise<{ reasserted: true }> {
  const at = nowMs()
  const row = await first<TokenRow>(
    'SELECT * FROM core_account_tokens WHERE purpose = \'reassert\' AND account_id = ? AND browser_hash = ? AND used_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1',
    session.accountId, await sessionKey(session), at,
  )
  if (!row) refuse(CODE_WRONG.code, CODE_WRONG.reason, { status: 422, remedy: CODE_WRONG.remedy })
  // Re-checked here as well: the session may have become strong since the code was sent.
  if (session.assurance !== 'basic') refuse('core.reassert.code-not-offered', 'This sign-in cannot be confirmed by email.', { status: 409, remedy: 'Use your passkey.' })
  const allowed = await useSetting('core.sign-in.code-attempts') as number
  if (row.attempts >= allowed) refuse('core.reassert.code-spent', 'Too many wrong codes were tried.', { status: 422, remedy: 'Ask for a new code.' })
  if (!row.code_hash || !sameText(await digest('code', `${row.id}:${code.trim()}`), row.code_hash)) {
    // Saved now, outside the request's unit, which a refusal never commits.
    await useContext().env.DB.prepare('UPDATE core_account_tokens SET attempts = attempts + 1 WHERE id = ?').bind(row.id).run()
    refuse(CODE_WRONG.code, CODE_WRONG.reason, { status: 422, remedy: CODE_WRONG.remedy, fields: { code: 'wrong' } })
  }
  unit.add({ sql: 'UPDATE core_account_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL AND attempts < ?', params: [at, row.id, allowed] }).expect(1, CODE_WRONG)
  reassert(unit, session.id, 'code', false)
  unit.audit({ action: 'sign-in', record: ['core.account', session.accountId], detail: { method: 'code', reassert: true } })
  return { reasserted: true }
}
